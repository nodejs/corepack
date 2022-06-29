import {once}                                                  from 'events';
import fs                                                      from 'fs';
import type {Dir}                                              from 'fs';
import path                                                    from 'path';
import semver                                                  from 'semver';

import * as debugUtils                                         from './debugUtils';
import * as folderUtils                                        from './folderUtils';
import * as fsUtils                                            from './fsUtils';
import * as httpUtils                                          from './httpUtils';
import * as nodeUtils                                          from './nodeUtils';
import {RegistrySpec, Descriptor, Locator, PackageManagerSpec} from './types';

export async function fetchAvailableTags(spec: RegistrySpec): Promise<Record<string, string>> {
  switch (spec.type) {
    case `npm`: {
      const data = await httpUtils.fetchAsJson(`https://registry.npmjs.org/${spec.package}`, {headers: {[`Accept`]: `application/vnd.npm.install-v1+json`}});
      return data[`dist-tags`];
    }
    case `url`: {
      const data = await httpUtils.fetchAsJson(spec.url);
      return data[spec.fields.tags];
    }
    default: {
      throw new Error(`Unsupported specification ${JSON.stringify(spec)}`);
    }
  }
}

export async function fetchAvailableVersions(spec: RegistrySpec): Promise<Array<string>> {
  switch (spec.type) {
    case `npm`: {
      const data = await httpUtils.fetchAsJson(`https://registry.npmjs.org/${spec.package}`, {headers: {[`Accept`]: `application/vnd.npm.install-v1+json`}});
      return Object.keys(data.versions);
    }
    case `url`: {
      const data = await httpUtils.fetchAsJson(spec.url);
      const field = data[spec.fields.versions];
      return Array.isArray(field) ? field : Object.keys(field);
    }
    default: {
      throw new Error(`Unsupported specification ${JSON.stringify(spec)}`);
    }
  }
}

export async function findInstalledVersion(installTarget: string, descriptor: Descriptor) {
  const installFolder = path.join(installTarget, descriptor.name);

  let cacheDirectory: Dir;
  try {
    cacheDirectory = await fs.promises.opendir(installFolder);
  } catch (error) {
    if ((error as nodeUtils.NodeError).code === `ENOENT`) {
      return null;
    } else {
      throw error;
    }
  }

  const range = new semver.Range(descriptor.range);
  let bestMatch: string | null = null;
  let maxSV: semver.SemVer | undefined = undefined;

  for await (const {name} of cacheDirectory) {
    // Some dot-folders tend to pop inside directories, especially on OSX
    if (name.startsWith(`.`))
      continue;

    // If the dirname correspond to an in-range version and is not lower than
    // the previous best match (or if there is not yet a previous best match),
    // it's our new best match.
    if (range.test(name) && maxSV?.compare(name) !== 1) {
      bestMatch = name;
      maxSV = new semver.SemVer(bestMatch);
    }
  }

  return bestMatch;
}

export async function installVersion(installTarget: string, locator: Locator, {spec}: {spec: PackageManagerSpec}) {
  const {default: tar} = await import(/* webpackMode: 'eager' */ `tar`);

  const installFolder = path.join(installTarget, locator.name, locator.reference);
  if (fs.existsSync(installFolder)) {
    debugUtils.log(`Reusing ${locator.name}@${locator.reference}`);
    return installFolder;
  }

  const url = spec.url.replace(`{}`, locator.reference);

  // Creating a temporary folder inside the install folder means that we
  // are sure it'll be in the same drive as the destination, so we can
  // just move it there atomically once we are done

  const tmpFolder = folderUtils.getTemporaryFolder(installTarget);
  debugUtils.log(`Installing ${locator.name}@${locator.reference} from ${url} to ${tmpFolder}`);
  const stream = await httpUtils.fetchUrlStream(url);

  const parsedUrl = new URL(url);
  const ext = path.posix.extname(parsedUrl.pathname);

  let outputFile: string | null = null;

  let sendTo: any;
  if (ext === `.tgz`) {
    sendTo = tar.x({strip: 1, cwd: tmpFolder});
  } else if (ext === `.js`) {
    outputFile = path.join(tmpFolder, path.posix.basename(parsedUrl.pathname));
    sendTo = fs.createWriteStream(outputFile);
  }

  stream.pipe(sendTo);

  await once(sendTo, `finish`);

  await fs.promises.mkdir(path.dirname(installFolder), {recursive: true});
  try {
    await fs.promises.rename(tmpFolder, installFolder);
  } catch (err) {
    if (
      (err as nodeUtils.NodeError).code === `ENOTEMPTY` ||
      // On Windows the error code is EPERM so we check if it is a directory
      ((err as nodeUtils.NodeError).code === `EPERM` && (await fs.promises.stat(installFolder)).isDirectory())
    ) {
      debugUtils.log(`Another instance of corepack installed ${locator.name}@${locator.reference}`);
      await fsUtils.rimraf(tmpFolder);
    } else {
      throw err;
    }
  }

  debugUtils.log(`Install finished`);
  return installFolder;
}

/**
 * Loads the binary, taking control of the current process.
 */
export async function runVersion(installSpec: { location: string, spec: PackageManagerSpec }, binName: string, args: Array<string>): Promise<void> {
  let binPath: string | null = null;
  if (Array.isArray(installSpec.spec.bin)) {
    if (installSpec.spec.bin.some(bin => bin === binName)) {
      const parsedUrl = new URL(installSpec.spec.url);
      const ext = path.posix.extname(parsedUrl.pathname);
      if (ext === `.js`) {
        binPath = path.join(installSpec.location, path.posix.basename(parsedUrl.pathname));
      }
    }
  } else {
    for (const [name, dest] of Object.entries(installSpec.spec.bin)) {
      if (name === binName) {
        binPath = path.join(installSpec.location, dest);
        break;
      }
    }
  }

  if (!binPath)
    throw new Error(`Assertion failed: Unable to locate path for bin '${binName}'`);

  nodeUtils.registerV8CompileCache();

  // We load the binary into the current process,
  // while making it think it was spawned.

  // Non-exhaustive list of requirements:
  // - Yarn uses process.argv[1] to determine its own path: https://github.com/yarnpkg/berry/blob/0da258120fc266b06f42aed67e4227e81a2a900f/packages/yarnpkg-cli/sources/main.ts#L80
  // - pnpm uses `require.main == null` to determine its own version: https://github.com/pnpm/pnpm/blob/e2866dee92991e979b2b0e960ddf5a74f6845d90/packages/cli-meta/src/index.ts#L14

  process.env.COREPACK_ROOT = path.dirname(eval(`__dirname`));

  process.argv = [
    process.execPath,
    binPath,
    ...args,
  ];
  process.execArgv = [];

  return nodeUtils.loadMainModule(binPath);
}
