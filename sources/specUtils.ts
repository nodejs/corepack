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

interface DevEngineDependency {
  name: string;
  version: string;
  onFail?: `ignore` | `warn` | `error`;
}
function warnOrThrow(errorMessage: string, onFail?: DevEngineDependency[`onFail`]) {
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
function parsePackageJSON(packageJSONContent: CorepackPackageJSON) {
  const {packageManager: pm} = packageJSONContent;
  if (packageJSONContent.devEngines?.packageManager != null) {
    const {packageManager} = packageJSONContent.devEngines;

    if (typeof packageManager !== `object`) {
      console.warn(`! Corepack only supports objects as valid value for devEngines.packageManager. The current value (${JSON.stringify(packageManager)}) will be ignored.`);
      return pm;
    }
    if (Array.isArray(packageManager)) {
      console.warn(`! Corepack does not currently support array values for devEngines.packageManager`);
      return pm;
    }

    const {name, version, onFail} = packageManager;
    if (typeof name !== `string` || name.includes(`@`)) {
      warnOrThrow(`The value of devEngines.packageManager.name ${JSON.stringify(name)} is not a supported string value`, onFail);
      return pm;
    }
    if (version != null && (typeof version !== `string` || !semverValidRange(version))) {
      warnOrThrow(`The value of devEngines.packageManager.version ${JSON.stringify(version)} is not a valid semver range`, onFail);
      return pm;
    }

    debugUtils.log(`devEngines.packageManager defines that ${name}${version ? `@${version}` : ``} should the local package manager`);

    if (pm) {
      if (!pm.startsWith?.(`${name}@`))
        warnOrThrow(`"packageManager" field is set to ${JSON.stringify(pm)} which does not match the "devEngines.packageManager" field set to ${JSON.stringify(name)}`, onFail);

      else if (version != null && !semverSatisfies(pm.slice(packageManager.name.length + 1), version))
        warnOrThrow(`"packageManager" field is set to ${JSON.stringify(pm)} which does not match the value defined in "devEngines.packageManager" for ${JSON.stringify(name)} of ${JSON.stringify(version)}`, onFail);

      return pm;
    }

    return {spec: `${name}@${version ?? `*`}`, name, version, toString() {
      return this.spec;
    }};
  }

  return pm;
}

export async function setLocalPackageManager(cwd: string, info: PreparedPackageManagerInfo) {
  const lookup = await loadSpecAndEnv(cwd);

  const projectFound = lookup.type !== `NoProject`;
  const range = projectFound && lookup.devEnginesValue;
  if (range) {
    if (info.locator.name !== range.name || !semverSatisfies(info.locator.reference, range.range)) {
      warnOrThrow(`The requested version of ${info.locator.name}@${info.locator.reference} does not match the devEngines specification (${range.name}@${range.range})`, range.onFail);
    }
  }

  const content = projectFound
    ? await fs.promises.readFile(lookup.target, `utf8`)
    : ``;

  const {data, indent} = nodeUtils.readPackageJson(content);

  const previousPackageManager = data.packageManager ?? (range ? `${range.name}@${range.range}` : `unknown`);
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
  getSpec: (options?: {enforceExactVersion?: boolean}) => Descriptor;
  devEnginesValue?: Descriptor & {onFail?: DevEngineDependency[`onFail`]};
  envFilePath?: string;
}
export type LoadSpecResult =
    | {type: `NoProject`, target: string, envFilePath?: string}
    | {type: `NoSpec`, target: string, envFilePath?: string, devEnginesValue?: FoundSpecResult[`devEnginesValue`]}
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

  const rawPmSpec = parsePackageJSON(selection.data);
  if (typeof rawPmSpec === `undefined`)
    return {type: `NoSpec`, target: selection.manifestPath, envFilePath: localEnv?.path};

  const devEnginesValue = selection.data.devEngines?.packageManager?.name && {
    name: selection.data.devEngines.packageManager.name,
    range: selection.data.devEngines.packageManager.version,
    onFail: selection.data.devEngines.packageManager.onFail,
  };

  if (typeof rawPmSpec === `object` && !semverValid(rawPmSpec.version)) {
    debugUtils.log(`${selection.manifestPath} devEngines does not specify a specific version`);
    return {type: `NoSpec`, target: selection.manifestPath, envFilePath: localEnv?.path, devEnginesValue};
  }

  const hasPackageManagerField = typeof rawPmSpec === `string`;
  debugUtils.log(`${selection.manifestPath} defines ${rawPmSpec} as local package manager${hasPackageManagerField ? ` using packageManager field` : ``}`);

  return {
    type: `Found`,
    target: selection.manifestPath,
    envFilePath: localEnv?.path,
    devEnginesValue: devEnginesValue?.range && devEnginesValue,
    // Lazy-loading it so we do not throw errors on commands that do not need valid spec.
    getSpec: ({enforceExactVersion = true} = {}) => parseSpec(`${rawPmSpec}`, path.relative(initialCwd, selection.manifestPath), {enforceExactVersion}),
  };
}
