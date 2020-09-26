import {UsageError}                                                                from 'clipanion';
import Enquirer                                                                    from 'enquirer';
import fs                                                                          from 'fs';
import path                                                                        from 'path';
import semver                                                                      from 'semver';

import * as miscUtils                                                              from './miscUtils';
import {SupportedPackageManagers, SupportedPackageManagerSet, Descriptor, Locator} from './types';

export function parseSpec(raw: unknown, source?: string): Descriptor {
  if (typeof raw !== `string`)
    throw new UsageError(`Invalid package manager specification in ${source}; expected a string`);

  const match = raw.match(/^(?!_)(.+)@(.+)$/);
  if (match === null || !semver.validRange(match[2]))
    throw new UsageError(`Invalid package manager specification in ${source}; expected a semver range`);

  if (!SupportedPackageManagerSet.has(match[1]))
    throw new UsageError(`Unsupported package manager specification (${match})`);

  return {
    name: match[1] as SupportedPackageManagers,
    range: match[2],
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
export async function findProjectSpec(initialCwd: string, locator: Locator): Promise<Descriptor> {
  while (true) {
    const result = await loadSpec(initialCwd);

    switch (result.type) {
      case `NoProject`: {
        await initProjectAndSpec(result.target, locator);
      } break;

      case `NoSpec`: {
        // A locator is a valid descriptor (but not the other way around)
        return {name: locator.name, range: locator.reference};
      } break;

      case `Found`: {
        if (result.spec.name !== locator.name) {
          throw new UsageError(`This project is configured to use ${result.spec.name}`);
        } else {
          return result.spec;
        }
      } break;
    }
  }
}

export type LoadSpecResult =
    | {type: `NoProject`, target: string}
    | {type: `NoSpec`, target: string}
    | {type: `Found`, spec: Descriptor};

export async function loadSpec(initialCwd: string): Promise<LoadSpecResult> {
  let nextCwd = initialCwd;
  let currCwd = ``;

  let selection: any = null;

  while (nextCwd !== currCwd && selection === null) {
    currCwd = nextCwd;
    nextCwd = path.dirname(currCwd);

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
    spec: parseSpec(rawPmSpec, path.relative(initialCwd, selection.manifestPath)),
  };
}

export async function persistPmSpec(updateTarget: string, locator: Locator, message: string) {
  const newSpec = `${locator.name}@^${locator.reference}`;

  let res: boolean;
  try {
    res = await Enquirer.prompt([{
      type: `confirm`,
      name: `confirm`,
      initial: true,
      message: message.replace(`{}`, newSpec),
    }]);
  } catch (err) {
    if (err === ``) {
      res = false;
    } else {
      throw err;
    }
  }

  if (!res)
    throw new miscUtils.Cancellation();

  const content = fs.existsSync(updateTarget)
    ? await fs.promises.readFile(updateTarget, `utf8`)
    : `{}`;

  const data = JSON.parse(content);
  data.packageManager = newSpec;

  const serialized = JSON.stringify(data, null, 2);
  await fs.promises.writeFile(updateTarget, `${serialized}\n`);
}

export async function initProjectAndSpec(updateTarget: string, locator: Locator) {
  return await persistPmSpec(updateTarget, locator, `No configured project yet; set it to {}?`);
}

export async function initSpec(updateTarget: string, locator: Locator) {
  return await persistPmSpec(updateTarget, locator, `No configured local package manager yet; set it to {}?`);
}
