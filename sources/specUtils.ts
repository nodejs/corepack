import {UsageError}                      from 'clipanion';
import fs                                from 'fs';
import path                              from 'path';
import semverSatisfies                   from 'semver/functions/satisfies.js';
import semverValid                       from 'semver/functions/valid.js';
import semverValidRange                  from 'semver/ranges/valid.js';
import {parseEnv}                        from 'util';

import type {PreparedPackageManagerInfo} from './Engine.ts';
import * as debugUtils                   from './debugUtils.ts';
import type {NodeError}                  from './nodeUtils.ts';
import * as nodeUtils                    from './nodeUtils.ts';
import {isSupportedPackageManager}       from './types.ts';
import type {LocalEnvFile, Descriptor}   from './types.ts';

const nodeModulesRegExp = /[\\/]node_modules[\\/](@[^\\/]*[\\/])?([^@\\/][^\\/]*)$/;

export function parseSpec(raw: unknown, source: string, {enforceExactVersion = true} = {}): Descriptor {
  if (typeof raw !== `string`)
    throw new UsageError(`Invalid package manager specification in ${source}; expected a string`);

  const atIndex = raw.indexOf(`@`);

  if (atIndex === -1 || atIndex === raw.length - 1) {
    if (enforceExactVersion)
      throw new UsageError(`No version specified for ${raw} in "packageManager" of ${source}`);

    const name = atIndex === -1 ? raw : raw.slice(0, -1);
    if (!isSupportedPackageManager(name))
      throw new UsageError(`Unsupported package manager specification (${name})`);

    return {
      name, range: `*`,
    };
  }

  const name = raw.slice(0, atIndex);
  const range = raw.slice(atIndex + 1);

  const isURL = URL.canParse(range);
  if (!isURL) {
    if (enforceExactVersion && !semverValid(range))
      throw new UsageError(`Invalid package manager specification in ${source} (${raw}); expected a semver version${enforceExactVersion ? `` : `, range, or tag`}`);

    if (!isSupportedPackageManager(name)) {
      throw new UsageError(`Unsupported package manager specification (${raw})`);
    }
  } else if (isSupportedPackageManager(name) && process.env.COREPACK_ENABLE_UNSAFE_CUSTOM_URLS !== `1`) {
    throw new UsageError(`Illegal use of URL for known package manager. Instead, select a specific version, or set COREPACK_ENABLE_UNSAFE_CUSTOM_URLS=1 in your environment (${raw})`);
  }


  return {
    name,
    range,
  };
}

type CorepackPackageJSON = {
  packageManager?: string;
  devEngines?: {packageManager?: DevEngineDependency};
};

export interface DevEngineDependency {
  name: string;
  /** Semver version or range, as found in the manifest. */
  version?: string;
  onFail?: `ignore` | `warn` | `error`;
}

export function devEnginesToDescriptor({name, version}: DevEngineDependency): Descriptor {
  return {name, range: version ?? `*`};
}

interface ParsedPackageJSON {
  packageManagerField?: string;
  devEnginesPackageManager?: DevEngineDependency;
}

export function warnOrThrow(errorMessage: string, onFail?: DevEngineDependency[`onFail`]) {
  switch (onFail) {
    case `ignore`:
      break;
    case `error`:
    case undefined:
      throw new UsageError(errorMessage);
    default:
      console.warn(`! Corepack validation warning: ${errorMessage}`);
  }
}
function parsePackageJSON(packageJSONContent: CorepackPackageJSON): ParsedPackageJSON {
  const {packageManager: pm} = packageJSONContent;
  if (packageJSONContent.devEngines?.packageManager != null) {
    const {packageManager} = packageJSONContent.devEngines;

    if (typeof packageManager !== `object`) {
      console.warn(`! Corepack only supports objects as valid value for devEngines.packageManager. The current value (${JSON.stringify(packageManager)}) will be ignored.`);
      return {packageManagerField: pm};
    }
    if (Array.isArray(packageManager)) {
      console.warn(`! Corepack does not currently support array values for devEngines.packageManager`);
      return {packageManagerField: pm};
    }

    const {name, version, onFail} = packageManager;
    if (typeof name !== `string` || name.includes(`@`)) {
      warnOrThrow(`The value of devEngines.packageManager.name ${JSON.stringify(name)} is not a supported string value`, onFail);
      return {packageManagerField: pm};
    }
    if (version != null && (typeof version !== `string` || !semverValidRange(version))) {
      warnOrThrow(`The value of devEngines.packageManager.version ${JSON.stringify(version)} is not a valid semver range`, onFail);
      return {packageManagerField: pm};
    }

    debugUtils.log(`devEngines.packageManager defines that ${name}${version ? `@${version}` : ``} should be the local package manager`);

    if (pm) {
      if (!pm.startsWith?.(`${name}@`)) {
        warnOrThrow(`"packageManager" field is set to ${JSON.stringify(pm)} which does not match the "devEngines.packageManager" field set to ${JSON.stringify(name)}`, onFail);
      } else if (version != null && !semverSatisfies(pm.slice(name.length + 1), version)) {
        warnOrThrow(`"packageManager" field is set to ${JSON.stringify(pm)} which does not match the value defined in "devEngines.packageManager" for ${JSON.stringify(name)} of ${JSON.stringify(version)}`, onFail);
      }
    }

    return {packageManagerField: pm, devEnginesPackageManager: {name, version, onFail}};
  }

  return {packageManagerField: pm};
}

export async function setLocalPackageManager(cwd: string, info: PreparedPackageManagerInfo) {
  const lookup = await loadSpecAndEnv(cwd);

  const projectFound = lookup.type !== `NoProject`;
  const devEnginesValue = projectFound ? lookup.devEnginesValue : undefined;
  if (devEnginesValue) {
    if (info.locator.name !== devEnginesValue.name || (devEnginesValue.version != null && !semverSatisfies(info.locator.reference, devEnginesValue.version))) {
      warnOrThrow(`The requested version of ${info.locator.name}@${info.locator.reference} does not match the devEngines specification (${devEnginesValue.name}@${devEnginesValue.version ?? `*`})`, devEnginesValue.onFail);
    }
  }

  const content = projectFound
    ? await fs.promises.readFile(lookup.target, `utf8`)
    : ``;

  const {data, indent} = nodeUtils.readPackageJson(content);

  const previousPackageManager = data.packageManager ?? (devEnginesValue ? `${devEnginesValue.name}@${devEnginesValue.version ?? `*`}` : `unknown`);
  data.packageManager = `${info.locator.name}@${info.locator.reference}`;

  const newContent = nodeUtils.normalizeLineEndings(content, `${JSON.stringify(data, null, indent)}\n`);
  await fs.promises.writeFile(lookup.target, newContent, `utf8`);

  return {
    previousPackageManager,
  };
}

interface FoundSpecResult {
  type: `Found`;
  target: string;
  /** Name of the `package.json` field the spec was read from. */
  field: `packageManager` | `devEngines.packageManager`;
  getSpec: (options?: {enforceExactVersion?: boolean}) => Descriptor;
  devEnginesValue?: DevEngineDependency;
  envFilePath?: string;
}
export type LoadSpecResult =
    | {type: `NoProject`, target: string, envFilePath?: string}
    | {type: `NoSpec`, target: string, envFilePath?: string, devEnginesValue?: DevEngineDependency}
    | FoundSpecResult;

async function loadEnvFileIfExists(cwd: string): Promise<{env: LocalEnvFile, path: string} | void> {
  const envFilePath = path.resolve(cwd, process.env.COREPACK_ENV_FILE ?? `.corepack.env`);
  if (process.env.COREPACK_ENV_FILE == `0`) {
    debugUtils.log(`Skipping env file as configured with COREPACK_ENV_FILE`);
    return void 0;
  }
  debugUtils.log(`Checking ${envFilePath}`);
  try {
    const localEnv = {
      ...Object.fromEntries(Object.entries(parseEnv(await fs.promises.readFile(envFilePath, `utf8`))).filter(e => e[0].startsWith(`COREPACK_`))),
      ...process.env,
    };
    debugUtils.log(`Successfully loaded env file found at ${envFilePath}`);
    return {env: localEnv, path: envFilePath};
  } catch (err) {
    if ((err as NodeError)?.code !== `ENOENT`)
      throw err;

    debugUtils.log(`No env file found at ${envFilePath}`);
  }
  return void 0;
}

export async function loadSpecAndEnv(initialCwd: string, {envOnly} = {envOnly: false}): Promise<LoadSpecResult> {
  let nextCwd = initialCwd;
  let currCwd = ``;

  let selection: {
    data: any;
    manifestPath: string;
  } | null = null;
  let localEnv: {env: LocalEnvFile, path: string} | void = void 0;

  while (nextCwd !== currCwd && (!selection || !selection.data.packageManager)) {
    currCwd = nextCwd;
    nextCwd = path.dirname(currCwd);

    if (nodeModulesRegExp.test(currCwd))
      continue;

    if (process.env.COREPACK_ENV_FILE !== `0` && !localEnv)
      localEnv = await loadEnvFileIfExists(currCwd);

    if (envOnly) {
      if (localEnv) break;
      continue;
    }

    const manifestPath = path.join(currCwd, `package.json`);
    debugUtils.log(`Checking ${manifestPath}`);
    let content: string;
    try {
      content = await fs.promises.readFile(manifestPath, `utf8`);
    } catch (err) {
      if ((err as NodeError)?.code === `ENOENT`) continue;
      throw err;
    }

    let data;
    try {
      data = JSON.parse(content);
    } catch {}

    if (typeof data !== `object` || data === null)
      throw new UsageError(`Invalid package.json in ${path.relative(currCwd, manifestPath)}`);

    selection = {data, manifestPath};
  }

  if (localEnv)
    process.env = localEnv.env;

  if (selection === null)
    return {type: `NoProject`, target: path.join(initialCwd, `package.json`), envFilePath: localEnv?.path};

  const {packageManagerField, devEnginesPackageManager} = parsePackageJSON(selection.data);

  if (devEnginesPackageManager != null && !packageManagerField) {
    const {name, version} = devEnginesPackageManager;

    // Without an exact version, there is nothing to install yet – the range (if
    // any) is resolved by the caller, as it would for a project without spec.
    if (!version || !semverValid(version)) {
      debugUtils.log(`${selection.manifestPath} defines ${name} as local package manager using devEngines.packageManager, without an exact version`);
      return {type: `NoSpec`, target: selection.manifestPath, envFilePath: localEnv?.path, devEnginesValue: devEnginesPackageManager};
    }

    debugUtils.log(`${selection.manifestPath} defines ${name}@${version} as local package manager using devEngines.packageManager`);

    return {
      type: `Found`,
      target: selection.manifestPath,
      field: `devEngines.packageManager`,
      envFilePath: localEnv?.path,
      devEnginesValue: devEnginesPackageManager,
      // Lazy-loading it so we do not throw errors on commands that do not need valid spec.
      getSpec: ({enforceExactVersion = true} = {}) => parseSpec(`${name}@${version}`, path.relative(initialCwd, selection.manifestPath), {enforceExactVersion}),
    };
  }

  if (packageManagerField === undefined)
    return {type: `NoSpec`, target: selection.manifestPath, envFilePath: localEnv?.path};

  debugUtils.log(`${selection.manifestPath} defines ${packageManagerField} as local package manager using the packageManager field`);

  return {
    type: `Found`,
    target: selection.manifestPath,
    field: `packageManager`,
    envFilePath: localEnv?.path,
    devEnginesValue: devEnginesPackageManager,
    // Lazy-loading it so we do not throw errors on commands that do not need valid spec.
    getSpec: ({enforceExactVersion = true} = {}) => parseSpec(packageManagerField, path.relative(initialCwd, selection.manifestPath), {enforceExactVersion}),
  };
}
