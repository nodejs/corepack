import {createHash}                                            from 'crypto';
import {once}                                                  from 'events';
import fs                                                      from 'fs';
import type {Dir}                                              from 'fs';
import Module                                                  from 'module';
import path                                                    from 'path';
import Range                                                   from 'semver/classes/range';
import SemVer                                                  from 'semver/classes/semver';
import semverLt                                                from 'semver/functions/lt';
import semverParse                                             from 'semver/functions/parse';
import {setTimeout as setTimeoutPromise}                       from 'timers/promises';

import * as engine                                             from './Engine';
import * as debugUtils                                         from './debugUtils';
import * as folderUtils                                        from './folderUtils';
import * as httpUtils                                          from './httpUtils';
import * as nodeUtils                                          from './nodeUtils';
import * as npmRegistryUtils                                   from './npmRegistryUtils';
import {RegistrySpec, Descriptor, Locator, PackageManagerSpec} from './types';
import {BinList, BinSpec, InstallSpec, DownloadSpec}           from './types';

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

  const range = new Range(descriptor.range);
  let bestMatch: string | null = null;
  let maxSV: SemVer | undefined = undefined;

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
      maxSV = new SemVer(bestMatch);
    }
  }

  return bestMatch;
}

export function isSupportedPackageManagerDescriptor(descriptor: Descriptor) {
  return !URL.canParse(descriptor.range);
}

export function isSupportedPackageManagerLocator(locator: Locator) {
  return !URL.canParse(locator.reference);
}

function parseURLReference(locator: Locator) {
  const {hash, href} = new URL(locator.reference);
  if (hash) {
    return {
      version: encodeURIComponent(href.slice(0, -hash.length)),
      build: hash.slice(1).split(`.`),
    };
  }
  return {version: encodeURIComponent(href), build: []};
}

function isValidBinList(x: unknown): x is BinList {
  return Array.isArray(x) && x.length > 0;
}

function isValidBinSpec(x: unknown): x is BinSpec {
  return typeof x === `object` && x !== null && !Array.isArray(x) && Object.keys(x).length > 0;
}

async function download(installTarget: string, url: string, algo: string, binPath: string | null = null): Promise<DownloadSpec> {
  // Creating a temporary folder inside the install folder means that we
  // are sure it'll be in the same drive as the destination, so we can
  // just move it there atomically once we are done

  const tmpFolder = folderUtils.getTemporaryFolder(installTarget);
  debugUtils.log(`Downloading to ${tmpFolder}`);

  const stream = await httpUtils.fetchUrlStream(url);

  const parsedUrl = new URL(url);
  const ext = path.posix.extname(parsedUrl.pathname);

  let outputFile: string | null = null;
  let sendTo: any;

  if (ext === `.tgz`) {
    const {extract: tarX} = await import(`tar/extract`);
    sendTo = tarX({
      strip: 1,
      cwd: tmpFolder,
      filter: binPath ? path => {
        const pos = path.indexOf(`/`);
        return pos !== -1 && path.slice(pos + 1) === binPath;
      } : undefined,
    });
  } else if (ext === `.js`) {
    outputFile = path.join(tmpFolder, path.posix.basename(parsedUrl.pathname));
    sendTo = fs.createWriteStream(outputFile);
  }
  stream.pipe(sendTo);

  let hash = !binPath ? stream.pipe(createHash(algo)) : null;
  await once(sendTo, `finish`);

  if (binPath) {
    const downloadedBin = path.join(tmpFolder, binPath);
    outputFile = path.join(tmpFolder, path.basename(downloadedBin));
    try {
      await renameSafe(downloadedBin, outputFile);
    } catch (err) {
      if ((err as nodeUtils.NodeError)?.code === `ENOENT`)
        throw new Error(`Cannot locate '${binPath}' in downloaded tarball`, {cause: err});

      throw err;
    }

    // Calculate the hash of the bin file
    const fileStream = fs.createReadStream(outputFile);
    hash = fileStream.pipe(createHash(algo));
    await once(fileStream, `close`);
  }

  return {
    tmpFolder,
    outputFile,
    hash: hash!.digest(`hex`),
  };
}

export async function installVersion(installTarget: string, locator: Locator, {spec}: {spec: PackageManagerSpec}): Promise<InstallSpec> {
  const locatorIsASupportedPackageManager = isSupportedPackageManagerLocator(locator);
  const locatorReference = locatorIsASupportedPackageManager ? semverParse(locator.reference)! : parseURLReference(locator);
  const {version, build} = locatorReference;

  const installFolder = path.join(installTarget, locator.name, version);

  try {
    const corepackFile = path.join(installFolder, `.corepack`);
    const corepackContent = await fs.promises.readFile(corepackFile, `utf8`);

    const corepackData = JSON.parse(corepackContent);

    debugUtils.log(`Reusing ${locator.name}@${locator.reference} found in ${installFolder}`);

    return {
      hash: corepackData.hash as string,
      location: installFolder,
      bin: corepackData.bin,
    };
  } catch (err) {
    if ((err as nodeUtils.NodeError)?.code !== `ENOENT`) {
      throw err;
    }
  }

  let url: string;
  let signatures: Array<{keyid: string, sig: string}>;
  let integrity: string;
  let binPath: string | null = null;
  if (locatorIsASupportedPackageManager) {
    url = spec.url.replace(`{}`, version);
    if (process.env.COREPACK_NPM_REGISTRY) {
      const registry = getRegistryFromPackageManagerSpec(spec);
      if (registry.type === `npm`) {
        ({tarball: url, signatures, integrity} = await npmRegistryUtils.fetchTarballURLAndSignature(registry.package, version));
        if (registry.bin) {
          binPath = registry.bin;
        }
      }
      url = url.replace(
        npmRegistryUtils.DEFAULT_NPM_REGISTRY_URL,
        () => process.env.COREPACK_NPM_REGISTRY!,
      );
    }
  } else {
    url = decodeURIComponent(version);
    if (process.env.COREPACK_NPM_REGISTRY && url.startsWith(npmRegistryUtils.DEFAULT_NPM_REGISTRY_URL)) {
      url = url.replace(
        npmRegistryUtils.DEFAULT_NPM_REGISTRY_URL,
        () => process.env.COREPACK_NPM_REGISTRY!,
      );
    }
  }

  debugUtils.log(`Installing ${locator.name}@${version} from ${url}`);
  const algo = build[0] ?? `sha512`;
  const {tmpFolder, outputFile, hash: actualHash} = await download(installTarget, url, algo, binPath);

  let bin: BinSpec | BinList;
  const isSingleFile = outputFile !== null;

  // In config, yarn berry is expected to be downloaded as a single file,
  // and therefore `spec.bin` is an array. However, when downloaded from
  // custom npm registry as tarball, `bin` should be a map.
  // In this case, we ignore the configured `spec.bin`.

  if (isSingleFile) {
    if (locatorIsASupportedPackageManager && isValidBinList(spec.bin)) {
      bin = spec.bin;
    } else {
      bin = [locator.name];
    }
  } else {
    if (locatorIsASupportedPackageManager && isValidBinSpec(spec.bin)) {
      bin = spec.bin;
    } else {
      const {name: packageName, bin: packageBin} = require(path.join(tmpFolder, `package.json`));
      if (typeof packageBin === `string`) {
        // When `bin` is a string, the name of the executable is the name of the package.
        bin = {[packageName]: packageBin};
      } else if (isValidBinSpec(packageBin)) {
        bin = packageBin;
      } else {
        throw new Error(`Unable to locate bin in package.json`);
      }
    }
  }

  if (!build[1]) {
    const registry = getRegistryFromPackageManagerSpec(spec);
    if (registry.type === `npm` && !registry.bin && !shouldSkipIntegrityCheck()) {
      if (signatures! == null || integrity! == null)
        ({signatures, integrity} = (await npmRegistryUtils.fetchTarballURLAndSignature(registry.package, version)));

      npmRegistryUtils.verifySignature({signatures, integrity, packageName: registry.package, version});
      // @ts-expect-error ignore readonly
      build[1] = Buffer.from(integrity.slice(`sha512-`.length), `base64`).toString(`hex`);
    }
  }
  if (build[1] && actualHash !== build[1])
    throw new Error(`Mismatch hashes. Expected ${build[1]}, got ${actualHash}`);

  const serializedHash = `${algo}.${actualHash}`;

  await fs.promises.writeFile(path.join(tmpFolder, `.corepack`), JSON.stringify({
    locator,
    bin,
    hash: serializedHash,
  }));

  await fs.promises.mkdir(path.dirname(installFolder), {recursive: true});
  try {
    await renameSafe(tmpFolder, installFolder);
  } catch (err) {
    if (
      (err as nodeUtils.NodeError).code === `ENOTEMPTY` ||
      // On Windows the error code is EPERM so we check if it is a directory
      ((err as nodeUtils.NodeError).code === `EPERM` && (await fs.promises.stat(installFolder)).isDirectory())
    ) {
      debugUtils.log(`Another instance of corepack installed ${locator.name}@${locator.reference}`);
      await fs.promises.rm(tmpFolder, {recursive: true, force: true});
    } else {
      throw err;
    }
  }

  if (locatorIsASupportedPackageManager && process.env.COREPACK_DEFAULT_TO_LATEST !== `0`) {
    const lastKnownGood = await engine.getLastKnownGood();
    const defaultVersion = engine.getLastKnownGoodFromFileContent(lastKnownGood, locator.name);
    if (defaultVersion) {
      const currentDefault = semverParse(defaultVersion)!;
      const downloadedVersion = locatorReference as SemVer;
      if (currentDefault.major === downloadedVersion.major && semverLt(currentDefault, downloadedVersion)) {
        await engine.activatePackageManager(lastKnownGood, locator);
      }
    }
  }

  debugUtils.log(`Download and install of ${locator.name}@${locator.reference} is finished`);

  return {
    location: installFolder,
    bin,
    hash: serializedHash,
  };
}

async function renameSafe(oldPath: fs.PathLike, newPath: fs.PathLike) {
  if (process.platform === `win32`) {
    await renameUnderWindows(oldPath, newPath);
  } else {
    await fs.promises.rename(oldPath, newPath);
  }
}

async function renameUnderWindows(oldPath: fs.PathLike, newPath: fs.PathLike) {
  // Windows malicious file analysis blocks files currently under analysis, so we need to wait for file release
  const retries = 5;
  for (let i = 0; i < retries; i++) {
    try {
      await fs.promises.rename(oldPath, newPath);
      break;
    } catch (err) {
      if (
        (
          (err as nodeUtils.NodeError).code === `ENOENT` ||
          (err as nodeUtils.NodeError).code === `EPERM`
        ) &&
        i < (retries - 1)
      ) {
        await setTimeoutPromise(100 * 2 ** i);
        continue;
      } else {
        throw err;
      }
    }
  }
}

/**
 * Loads the binary, taking control of the current process.
 */
export async function runVersion(locator: Locator, installSpec: InstallSpec & {spec: PackageManagerSpec}, binName: string, args: Array<string>): Promise<void> {
  let binPath: string | null = null;
  const bin = installSpec.bin ?? installSpec.spec.bin;
  if (Array.isArray(bin)) {
    if (bin.some(name => name === binName)) {
      const parsedUrl = new URL(installSpec.spec.url);
      const ext = path.posix.extname(parsedUrl.pathname);
      if (ext === `.js`) {
        binPath = path.join(installSpec.location, path.posix.basename(parsedUrl.pathname));
      }
    }
  } else {
    for (const [name, dest] of Object.entries(bin)) {
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
  if (locator.name !== `npm` || semverLt(locator.reference, `9.7.0`))
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

export function shouldSkipIntegrityCheck() {
  return process.env.COREPACK_INTEGRITY_KEYS === ``
    || process.env.COREPACK_INTEGRITY_KEYS === `0`;
}
