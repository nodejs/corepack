import {UsageError}                                     from 'clipanion';
import fs                                               from 'fs';
import path                                             from 'path';
import semver                                           from 'semver';

import {Descriptor, Locator, isSupportedPackageManager} from './types';

const nodeModulesRegExp = /[\\/]node_modules[\\/](@[^\\/]*[\\/])?([^@\\/][^\\/]*)$/;

export function parseSpec(raw: unknown, source: string, {enforceExactVersion = true} = {}): Descriptor {
  if (typeof raw !== `string`)
    throw new UsageError(`Invalid package manager specification in ${source}; expected a string`);

  const match = raw.match(/^(?!_)([^@]+)(?:@(.+))?$/);
  if (match === null || (enforceExactVersion && (!match[2] || !semver.valid(match[2]))))
    throw new UsageError(`Invalid package manager specification in ${source} (${raw}); expected a semver version${enforceExactVersion ? `` : `, range, or tag`}`);

  if (!isSupportedPackageManager(match[1]))
    throw new UsageError(`Unsupported package manager specification (${match})`);

  return {
    name: match[1],
    range: match[2] ?? `*`,
  };
}

/**
 * Locates the active project's package manager specification.
 *
 * If the specification exists but doesn't match the active package manager,
 * an error is thrown to prevent users from using the wrong package manager,
 * which would lead to inconsistent project layouts.
 *
 * If the project doesn't include a specification file, we just assume that
 * whatever the user uses is exactly what they want to use. Since the version
 * isn't explicited, we fallback on known good versions.
 *
 * Finally, if the project doesn't exist at all, we ask the user whether they
 * want to create one in the current project. If they do, we initialize a new
 * project using the default package managers, and configure it so that we
 * don't need to ask again in the future.
 */
export async function findProjectSpec(initialCwd: string, locator: Locator, {transparent = false}: {transparent?: boolean} = {}): Promise<Descriptor> {
  // A locator is a valid descriptor (but not the other way around)
  const fallbackLocator = {name: locator.name, range: locator.reference};

  if (process.env.COREPACK_ENABLE_PROJECT_SPEC === `0`)
    return fallbackLocator;

  if (process.env.COREPACK_ENABLE_STRICT === `0`)
    transparent = true;

  while (true) {
    const result = await loadSpec(initialCwd);

    switch (result.type) {
      case `NoProject`:
      case `NoSpec`: {
        return fallbackLocator;
      }

      case `Found`: {
        if (result.spec.name !== locator.name) {
          if (transparent) {
            return fallbackLocator;
          } else {
            throw new UsageError(`This project is configured to use ${result.spec.name}`);
          }
        } else {
          return result.spec;
        }
      }
    }
  }
}

export type LoadSpecResult =
    | {type: `NoProject`, target: string}
    | {type: `NoSpec`, target: string}
    | {type: `Found`, target: string, spec: Descriptor};

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
    if (!fs.existsSync(manifestPath))
      continue;

    const content = await fs.promises.readFile(manifestPath, `utf8`);

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

  const rawPmSpec = selection.data.packageManager;
  if (typeof rawPmSpec === `undefined`)
    return {type: `NoSpec`, target: selection.manifestPath};

  return {
    type: `Found`,
    target: selection.manifestPath,
    spec: parseSpec(rawPmSpec, path.relative(initialCwd, selection.manifestPath)),
  };
}
