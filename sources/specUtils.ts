import {UsageError}                      from 'clipanion';
import fs                                from 'fs';
import path                              from 'path';
import semverSatisfies                   from 'semver/functions/satisfies';
import semverValid                       from 'semver/functions/valid';
import semverValidRange                  from 'semver/ranges/valid';
import {parseEnv}                        from 'util';

import type {PreparedPackageManagerInfo} from './Engine';
import * as debugUtils                   from './debugUtils';
import type {NodeError}                  from './nodeUtils';
import * as nodeUtils                    from './nodeUtils';
import {isSupportedPackageManager}       from './types';
import type {LocalEnvFile, Descriptor}   from './types';

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
  devEngines?: { packageManager?: DevEngineDependency };
};

interface DevEngineDependency {
  name: string;
  version: string;
  onFail?: 'ignore' | 'warn' | 'error';
}
function warnOrThrow(errorMessage: string, onFail?: DevEngineDependency['onFail']) {
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
  if (packageJSONContent.devEngines?.packageManager != null) {
    const {packageManager} = packageJSONContent.devEngines;

    if (typeof packageManager !== `object`) {
      console.warn(`! Corepack only supports objects as valid value for devEngines.packageManager. The current value (${JSON.stringify(packageManager)}) will be ignored.`);
      return packageJSONContent.packageManager;
    }
    if (Array.isArray(packageManager)) {
      console.warn(`! Corepack does not currently support array values for devEngines.packageManager`);
      return packageJSONContent.packageManager;
    }

    const {name, version, onFail} = packageManager;
    if (typeof name !== `string` || name.includes(`@`)) {
      warnOrThrow(`The value of devEngines.packageManager.name ${JSON.stringify(name)} is not a supported string value`, onFail);
      return packageJSONContent.packageManager;
    }
    if (version != null && (typeof version !== `string` || !semverValidRange(version))) {
      warnOrThrow(`The value of devEngines.packageManager.version ${JSON.stringify(version)} is not a valid semver range`, onFail);
      return packageJSONContent.packageManager;
    }

    debugUtils.log(`devEngines.packageManager defines that ${name}@${version} is the local package manager`);

    const localEnvKey = `COREPACK_DEV_ENGINES_${packageManager.name.toUpperCase()}`;
    const localEnvVersion = process.env[localEnvKey];
    if (localEnvVersion) {
      debugUtils.log(`Environment defines that ${name}@${localEnvVersion} is the local package manager`);

      if (!semverSatisfies(localEnvVersion, version))
        warnOrThrow(`"${localEnvKey}" environment variable is set to ${JSON.stringify(localEnvVersion)} which does not match the value defined in "devEngines.packageManager" for ${JSON.stringify(name)} of ${JSON.stringify(version)}`, onFail);

      return `${name}@${localEnvVersion}`;
    }

    const {packageManager: pm} = packageJSONContent;
    if (pm) {
      if (!pm.startsWith(`${name}@`))
        warnOrThrow(`"packageManager" field is set to ${JSON.stringify(pm)} which does not match the "devEngines.packageManager" field set to ${JSON.stringify(name)}`, onFail);

      else if (version != null && !semverSatisfies(pm.slice(packageManager.name.length + 1), version))
        warnOrThrow(`"packageManager" field is set to ${JSON.stringify(pm)} which does not match the value defined in "devEngines.packageManager" for ${JSON.stringify(name)} of ${JSON.stringify(version)}`, onFail);

      return pm;
    }


    return `${name}@${version ?? `*`}`;
  }

  return packageJSONContent.packageManager;
}

export async function setLocalPackageManager(cwd: string, info: PreparedPackageManagerInfo) {
  const lookup = await loadSpec(cwd);

  const content = lookup.type !== `NoProject`
    ? await fs.promises.readFile((lookup as FoundSpecResult).envFilePath ?? lookup.target, `utf8`)
    : ``;

  let previousPackageManager: string;
  let newContent: string;
  if ((lookup as FoundSpecResult).envFilePath) {
    const envKey = `COREPACK_DEV_ENGINES_${(lookup as FoundSpecResult).spec.name.toUpperCase()}`;
    const index = content.lastIndexOf(`\n${envKey}=`) + 1;

    if (index === 0 && !content.startsWith(`${envKey}=`))
      throw new Error(`INTERNAL ASSERTION ERROR: missing expected ${envKey} in .corepack.env`);

    const lineEndIndex = content.indexOf(`\n`, index);

    previousPackageManager = content.slice(index, lineEndIndex === -1 ? undefined : lineEndIndex);
    newContent = `${content.slice(0, index)}\n${envKey}=${info.locator.reference}\n${lineEndIndex === -1 ? `` : content.slice(lineEndIndex)}`;
  } else {
    const {data, indent} = nodeUtils.readPackageJson(content);

    previousPackageManager = data.packageManager ?? `unknown`;
    data.packageManager = `${info.locator.name}@${info.locator.reference}`;

    newContent = `${JSON.stringify(data, null, indent)}\n`;
  }

  newContent = nodeUtils.normalizeLineEndings(content, newContent);
  await fs.promises.writeFile((lookup as FoundSpecResult).envFilePath ?? lookup.target, newContent, `utf8`);

  return {
    previousPackageManager,
  };
}

type FoundSpecResult = {type: `Found`, target: string, spec: Descriptor, range?: Descriptor, envFilePath?: string};
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

  while (nextCwd !== currCwd && (!selection || !selection.data.packageManager)) {
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

  const rawPmSpec = parsePackageJSON(selection.data);
  if (typeof rawPmSpec === `undefined`)
    return {type: `NoSpec`, target: selection.manifestPath};

  debugUtils.log(`${selection.manifestPath} defines ${rawPmSpec} as local package manager`);

  return {
    type: `Found`,
    target: selection.manifestPath,
    envFilePath,
    spec: parseSpec(rawPmSpec, path.relative(initialCwd, selection.manifestPath)),
    range: selection.data.devEngines?.packageManager?.version && {
      name: selection.data.devEngines.packageManager.name,
      range: selection.data.devEngines.packageManager.version,
    },
  };
}
