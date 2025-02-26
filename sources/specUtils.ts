import {UsageError}                            from 'clipanion';
import fs                                      from 'fs';
import path                                    from 'path';
import semverSatisfies                         from 'semver/functions/satisfies';
import semverValid                             from 'semver/functions/valid';
import semverValidRange                        from 'semver/ranges/valid';

import {PreparedPackageManagerInfo}            from './Engine';
import * as debugUtils                         from './debugUtils';
import {NodeError}                             from './nodeUtils';
import * as nodeUtils                          from './nodeUtils';
import {Descriptor, isSupportedPackageManager} from './types';

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

    debugUtils.log(`devEngines.packageManager defines that ${name}@${version} is the local package manager`);

    if (pm) {
      if (!pm.startsWith?.(`${name}@`))
        warnOrThrow(`"packageManager" field is set to ${JSON.stringify(pm)} which does not match the "devEngines.packageManager" field set to ${JSON.stringify(name)}`, onFail);

      else if (version != null && !semverSatisfies(pm.slice(packageManager.name.length + 1), version))
        warnOrThrow(`"packageManager" field is set to ${JSON.stringify(pm)} which does not match the value defined in "devEngines.packageManager" for ${JSON.stringify(name)} of ${JSON.stringify(version)}`, onFail);

      return pm;
    }


    return `${name}@${version ?? `*`}`;
  }

  return pm;
}

export async function setLocalPackageManager(cwd: string, info: PreparedPackageManagerInfo) {
  const lookup = await loadSpec(cwd);

  const range = `range` in lookup && lookup.range;
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

export type LoadSpecResult =
    | {type: `NoProject`, target: string}
    | {type: `NoSpec`, target: string}
    | {type: `Found`, target: string, spec: Descriptor, range?: Descriptor & {onFail?: DevEngineDependency['onFail']}};

export async function loadSpec(initialCwd: string): Promise<LoadSpecResult> {
  let nextCwd = initialCwd;
  let currCwd = ``;

  let selection: {
    data: any;
    manifestPath: string;
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

    selection = {data, manifestPath};
  }

  if (selection === null)
    return {type: `NoProject`, target: path.join(initialCwd, `package.json`)};

  const rawPmSpec = parsePackageJSON(selection.data);
  if (typeof rawPmSpec === `undefined`)
    return {type: `NoSpec`, target: selection.manifestPath};

  debugUtils.log(`${selection.manifestPath} defines ${rawPmSpec} as local package manager`);

  const spec = parseSpec(rawPmSpec, path.relative(initialCwd, selection.manifestPath));
  return {
    type: `Found`,
    target: selection.manifestPath,
    spec,
    range: selection.data.devEngines?.packageManager?.version && {
      name: selection.data.devEngines.packageManager.name,
      range: selection.data.devEngines.packageManager.version,
      onFail: selection.data.devEngines.packageManager.onFail,
    },
  };
}
