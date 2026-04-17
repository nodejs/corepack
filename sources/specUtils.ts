import {UsageError}                            from 'clipanion';
import fs                                      from 'fs';
import path                                    from 'path';
import semverSatisfies                         from 'semver/functions/satisfies';
import semverValid                             from 'semver/functions/valid';
import semverValidRange                        from 'semver/ranges/valid';
import {parseEnv}                              from 'util';

import {PreparedPackageManagerInfo}            from './Engine';
import * as debugUtils                         from './debugUtils';
import {NodeError}                             from './nodeUtils';
import * as nodeUtils                          from './nodeUtils';
import {Descriptor, isSupportedPackageManager} from './types';
import type {LocalEnvFile}                     from './types';

const nodeModulesRegExp = /[\\/]node_modules[\\/](@[^\\/]*[\\/])?([^@\\/][^\\/]*)$/;

export function parseSpec(arg: string | ParsedPackageManager, source: string, {enforceExactVersion = true} = {}): Descriptor {
  let raw: string;
  let sourceField: PackageManagerSourceField | undefined;

  if (typeof arg === `object` && arg.sourceField !== undefined) {
    raw = arg.rawPmSpec;
    sourceField = arg.sourceField;
  } else {
    raw = arg as string;
    sourceField = undefined;
  }

  const maybeSourceFieldOf = sourceField ? `"${sourceField}" of ` : ``;

  if (typeof raw !== `string`)
    throw new UsageError(`Invalid package manager specification in ${maybeSourceFieldOf}${source}; expected a string`);

  const atIndex = raw.indexOf(`@`);

  if (atIndex === -1 || atIndex === raw.length - 1) {
    if (enforceExactVersion)
      throw new UsageError(`No version specified for ${raw} in ${maybeSourceFieldOf}${source}`);

    const name = atIndex === -1 ? raw : raw.slice(0, -1);
    if (!isSupportedPackageManager(name))
      throw new UsageError(`Unsupported package manager specification (${name}) in ${maybeSourceFieldOf}${source}`);

    return {
      name, range: `*`,
    };
  }

  const name = raw.slice(0, atIndex);
  const range = raw.slice(atIndex + 1);

  const isURL = URL.canParse(range);
  if (!isURL) {
    if (enforceExactVersion && !semverValid(range))
      throw new UsageError(`Invalid package manager specification in ${maybeSourceFieldOf}${source} (${raw}); expected a semver version${enforceExactVersion ? `` : `, range, or tag`}`);

    if (!isSupportedPackageManager(name)) {
      throw new UsageError(`Unsupported package manager specification (${raw}) in ${maybeSourceFieldOf}${source}`);
    }
  } else if (isSupportedPackageManager(name) && process.env.COREPACK_ENABLE_UNSAFE_CUSTOM_URLS !== `1`) {
    throw new UsageError(`Illegal use of URL for known package manager. Instead, select a specific version, or set COREPACK_ENABLE_UNSAFE_CUSTOM_URLS=1 in your environment (${raw}) in ${maybeSourceFieldOf}${source}`);
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

type PackageManagerSourceField = `packageManager` | `devEngines.packageManager`;

type ParsedPackageManager = {
  sourceField: PackageManagerSourceField;
  rawPmSpec: string;
  devEnginesValues?: DevEngineDependency;
} & ({
  sourceField: `packageManager`;
} | {
  sourceField: `devEngines.packageManager`;
  devEnginesValues: DevEngineDependency;
}
);

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
function parsePackageJSON(packageJSONContent: CorepackPackageJSON): ParsedPackageManager | undefined {
  const {packageManager: pm} = packageJSONContent;
  const resultFromPackageManager = pm
    ? {sourceField: `packageManager`, rawPmSpec: pm} satisfies ParsedPackageManager
    : undefined;

  if (packageJSONContent.devEngines?.packageManager) {
    const {packageManager} = packageJSONContent.devEngines;

    if (typeof packageManager !== `object`) {
      console.warn(`! Corepack only supports objects as valid value for devEngines.packageManager. The current value (${JSON.stringify(packageManager)}) will be ignored.`);
      return resultFromPackageManager;
    }
    if (Array.isArray(packageManager)) {
      console.warn(`! Corepack does not currently support array values for devEngines.packageManager`);
      return resultFromPackageManager;
    }

    const {name, version, onFail} = packageManager;
    if (typeof name !== `string` || name.includes(`@`)) {
      warnOrThrow(`The value of devEngines.packageManager.name ${JSON.stringify(name)} is not a supported string value`, onFail);
      return resultFromPackageManager;
    }
    if (version != null && (typeof version !== `string` || !semverValidRange(version))) {
      warnOrThrow(`The value of devEngines.packageManager.version ${JSON.stringify(version)} is not a valid semver range`, onFail);
      return resultFromPackageManager;
    }

    debugUtils.log(`devEngines.packageManager defines that ${name}@${version} is the local package manager`);

    if (pm) {
      if (!pm.startsWith?.(`${name}@`))
        warnOrThrow(`"packageManager" field is set to ${JSON.stringify(pm)} which does not match the "devEngines.packageManager" field set to ${JSON.stringify(name)}`, onFail);

      else if (version != null && !semverSatisfies(pm.slice(packageManager.name.length + 1), version))
        warnOrThrow(`"packageManager" field is set to ${JSON.stringify(pm)} which does not match the value defined in "devEngines.packageManager" for ${JSON.stringify(name)} of ${JSON.stringify(version)}`, onFail);

      return {
        ...resultFromPackageManager!,
        devEnginesValues: packageManager,
      };
    }
    return {
      sourceField: `devEngines.packageManager`,
      rawPmSpec: `${name}@${version ?? `*`}`,
      devEnginesValues: packageManager,
    };
  }

  return resultFromPackageManager;
}

export async function setLocalPackageManager(cwd: string, info: PreparedPackageManagerInfo) {
  const lookup = await loadSpec(cwd);

  const range = `devEnginesRange` in lookup && lookup.devEnginesRange;
  if (range) {
    if (info.locator.name !== range.name || !semverSatisfies(info.locator.reference, range.range)) {
      warnOrThrow(`The requested version of ${info.locator.name}@${info.locator.reference} does not match the devEngines specification (${range.name}@${range.range})`, range.onFail);
    }
  }

  const content = lookup.type !== `NoProject`
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
  envFilePath?: string;
  sourceField: PackageManagerSourceField; // source of the spec
  devEnginesRange?: Descriptor & {onFail: Required<DevEngineDependency>[`onFail`]};
}
export type LoadSpecResult =
    | {type: `NoProject`, target: string}
    | {type: `NoSpec`, target: string}
    | FoundSpecResult;

export async function loadSpec(initialCwd: string): Promise<LoadSpecResult> {
  let nextCwd = initialCwd;
  let currCwd = ``;

  let selection: {
    data: any;
    manifestPath: string;
    envFilePath?: string;
    localEnv: LocalEnvFile;
  } | null = null;

  const selectionHasPmSpecified = (selection: {data: CorepackPackageJSON} | null) => {
    return selection !== null && (selection.data.packageManager || selection.data.devEngines?.packageManager);
  };

  while (nextCwd !== currCwd && !selectionHasPmSpecified(selection)) {
    currCwd = nextCwd;
    nextCwd = path.dirname(currCwd);

    if (nodeModulesRegExp.test(currCwd))
      continue;

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
      throw new UsageError(`Invalid package.json in ${path.relative(initialCwd, manifestPath)}`);

    let localEnv: LocalEnvFile;
    const envFilePath = path.resolve(currCwd, process.env.COREPACK_ENV_FILE ?? `.corepack.env`);
    if (process.env.COREPACK_ENV_FILE == `0`) {
      debugUtils.log(`Skipping env file as configured with COREPACK_ENV_FILE`);
      localEnv = process.env;
    } else if (typeof parseEnv !== `function`) {
      // TODO: remove this block when support for Node.js 18.x is dropped.
      debugUtils.log(`Skipping env file as it is not supported by the current version of Node.js`);
      localEnv = process.env;
    } else {
      debugUtils.log(`Checking ${envFilePath}`);
      try {
        localEnv = {
          ...Object.fromEntries(Object.entries(parseEnv(await fs.promises.readFile(envFilePath, `utf8`))).filter(e => e[0].startsWith(`COREPACK_`))),
          ...process.env,
        };
        debugUtils.log(`Successfully loaded env file found at ${envFilePath}`);
      } catch (err) {
        if ((err as NodeError)?.code !== `ENOENT`)
          throw err;

        debugUtils.log(`No env file found at ${envFilePath}`);
        localEnv = process.env;
      }
    }

    selection = {data, manifestPath, localEnv, envFilePath};
  }

  if (selection === null)
    return {type: `NoProject`, target: path.join(initialCwd, `package.json`)};

  let envFilePath: string | undefined;
  if (selection.localEnv !== process.env) {
    envFilePath = selection.envFilePath;
    process.env = selection.localEnv;
  }

  const parsedPackageManager = parsePackageJSON(selection.data);
  if (typeof parsedPackageManager === `undefined`)
    return {type: `NoSpec`, target: selection.manifestPath};

  debugUtils.log(`${selection.manifestPath} defines ${parsedPackageManager.rawPmSpec} as local package manager via ${parsedPackageManager.sourceField}`);

  return {
    type: `Found`,
    target: selection.manifestPath,
    sourceField: parsedPackageManager.sourceField,
    envFilePath,
    devEnginesRange: parsedPackageManager.devEnginesValues && {
      name: parsedPackageManager.devEnginesValues.name,
      range: parsedPackageManager.devEnginesValues.version,
      onFail: parsedPackageManager.devEnginesValues.onFail ?? `error`,
    },
    // Lazy-loading it so we do not throw errors on commands that do not need valid spec.
    getSpec: ({enforceExactVersion = true} = {}) => parseSpec(parsedPackageManager, path.relative(initialCwd, selection.manifestPath), {enforceExactVersion}),
  };
}
