import {UsageError}                      from 'clipanion';
import fs                                from 'fs';
import path                              from 'path';
import semverValid                       from 'semver/functions/valid';
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

export async function setLocalPackageManager(cwd: string, info: PreparedPackageManagerInfo) {
  const lookup = await loadSpec(cwd);

  const content = lookup.type !== `NoProject`
    ? await fs.promises.readFile(lookup.target, `utf8`)
    : ``;

  const {data, indent} = nodeUtils.readPackageJson(content);

  const previousPackageManager = data.packageManager ?? `unknown`;
  data.packageManager = `${info.locator.name}@${info.locator.reference}`;

  const newContent = nodeUtils.normalizeLineEndings(content, `${JSON.stringify(data, null, indent)}\n`);
  await fs.promises.writeFile(lookup.target, newContent, `utf8`);

  return {
    previousPackageManager,
  };
}

type FoundSpecResult = {type: `Found`, target: string, spec: Descriptor, envFilePath?: string};
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

  const rawPmSpec = selection.data.packageManager;
  if (typeof rawPmSpec === `undefined`)
    return {type: `NoSpec`, target: selection.manifestPath};

  debugUtils.log(`${selection.manifestPath} defines ${rawPmSpec} as local package manager`);

  return {
    type: `Found`,
    target: selection.manifestPath,
    envFilePath,
    spec: parseSpec(rawPmSpec, path.relative(initialCwd, selection.manifestPath)),
  };
}
