import {createHash}                                            from 'crypto';
import {once}                                                  from 'events';
import fs                                                      from 'fs';
import type {Dir}                                              from 'fs';
import Module                                                  from 'module';
import path                                                    from 'path';
import semver                                                  from 'semver';

import * as debugUtils                                         from './debugUtils';
import * as folderUtils                                        from './folderUtils';
import * as fsUtils                                            from './fsUtils';
import * as httpUtils                                          from './httpUtils';
import * as nodeUtils                                          from './nodeUtils';
import * as npmRegistryUtils                                   from './npmRegistryUtils';
import {RegistrySpec, Descriptor, Locator, PackageManagerSpec} from './types';

export function getRegistryFromPackageManagerSpec(spec: PackageManagerSpec) {
  return process.env.COREPACK_NPM_REGISTRY
    ? spec.npmRegistry ?? spec.registry
    : spec.registry;
}

export async function fetchLatestStableVersion(spec: RegistrySpec): Promise<string> {
  switch (spec.type) {
    case `npm`: {
      return await npmRegistryUtils.fetchLatestStableVersion(spec.package);
    }
    case `url`: {
      const data = await httpUtils.fetchAsJson(spec.url);
      return data[spec.fields.tags].stable;
    }
    default: {
      throw new Error(`Unsupported specification ${JSON.stringify(spec)}`);
    }
  }
}

export async function fetchAvailableTags(spec: RegistrySpec): Promise<Record<string, string>> {
  switch (spec.type) {
    case `npm`: {
      return await npmRegistryUtils.fetchAvailableTags(spec.package);
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
      return await npmRegistryUtils.fetchAvailableVersions(spec.package);
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
    // @ts-expect-error TODO: decipher why this produces an error
    if (range.test(name) && maxSV?.compare(name) !== 1) {
      bestMatch = name;
      maxSV = new semver.SemVer(bestMatch);
    }
  }

  return bestMatch;
}

export async function installVersion(installTarget: string, locator: Locator, {spec}: {spec: PackageManagerSpec}) {
  const {default: tar} = await import(`tar`);
  const {version, build} = semver.parse(locator.reference)!;

  const installFolder = path.join(installTarget, locator.name, version);
  const corepackFile = path.join(installFolder, `.corepack`);

  // Older versions of Corepack didn't generate the `.corepack` file; in
  // that case we just download the package manager anew.
  if (fs.existsSync(corepackFile)) {
    const corepackContent = await fs.promises.readFile(corepackFile, `utf8`);
    const corepackData = JSON.parse(corepackContent);

    debugUtils.log(`Reusing ${locator.name}@${locator.reference}`);

    return {
      hash: corepackData.hash as string,
      location: installFolder,
    };
  }

  const defaultNpmRegistryURL = spec.url.replace(`{}`, version);
  const url = process.env.COREPACK_NPM_REGISTRY ?
    defaultNpmRegistryURL.replace(
      npmRegistryUtils.DEFAULT_NPM_REGISTRY_URL,
      () => process.env.COREPACK_NPM_REGISTRY!,
    ) :
    defaultNpmRegistryURL;

  // Creating a temporary folder inside the install folder means that we
  // are sure it'll be in the same drive as the destination, so we can
  // just move it there atomically once we are done

  const tmpFolder = folderUtils.getTemporaryFolder(installTarget);
  debugUtils.log(`Installing ${locator.name}@${version} from ${url} to ${tmpFolder}`);
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

  const algo = build[0] ?? `sha256`;
  const hash = stream.pipe(createHash(algo));
  await once(sendTo, `finish`);

  const actualHash = hash.digest(`hex`);
  if (build[1] && actualHash !== build[1])
    throw new Error(`Mismatch hashes. Expected ${build[1]}, got ${actualHash}`);

  const serializedHash = `${algo}.${actualHash}`;

  await fs.promises.writeFile(path.join(tmpFolder, `.corepack`), JSON.stringify({
    locator,
    hash: serializedHash,
  }));

  // The target folder may exist if a previous version of Corepack installed
  // it but didn't create the `.corepack` file. In this case we need to
  // remove it first.
  await fs.promises.rm(installFolder, {
    recursive: true,
    force: true,
  });

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

  return {
    location: installFolder,
    hash: serializedHash,
  };
}

/**
 * Loads the binary, taking control of the current process.
 */
export async function runVersion(locator: Locator, installSpec: { location: string, spec: PackageManagerSpec }, binName: string, args: Array<string>): Promise<void> {
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

  // Node.js segfaults when using npm@>=9.7.0 and v8-compile-cache
  // $ docker run -it node:20.3.0-slim corepack npm@9.7.1 --version
  // [SIGSEGV]
  if (locator.name !== `npm` || semver.lt(locator.reference, `9.7.0`))
    // @ts-expect-error - No types
    await import(`v8-compile-cache`);

  // We load the binary into the current process,
  // while making it think it was spawned.

  // Non-exhaustive list of requirements:
  // - Yarn uses process.argv[1] to determine its own path: https://github.com/yarnpkg/berry/blob/0da258120fc266b06f42aed67e4227e81a2a900f/packages/yarnpkg-cli/sources/main.ts#L80
  // - pnpm uses `require.main == null` to determine its own version: https://github.com/pnpm/pnpm/blob/e2866dee92991e979b2b0e960ddf5a74f6845d90/packages/cli-meta/src/index.ts#L14

  process.env.COREPACK_ROOT = path.dirname(require.resolve(`corepack/package.json`));

  process.argv = [
    process.execPath,
    binPath,
    ...args,
  ];
  process.execArgv = [];

  // Unset the mainModule and let Node.js set it when needed.
  process.mainModule = undefined;

  // Use nextTick to unwind the stack, and consequently remove Corepack from
  // the stack trace of the package manager.
  process.nextTick(Module.runMain, binPath);
}
