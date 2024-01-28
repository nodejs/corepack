import {UsageError}                                           from 'clipanion';
import type {FileHandle}                                      from 'fs/promises';
import fs                                                     from 'fs';
import path                                                   from 'path';
import process                                                from 'process';
import semver                                                 from 'semver';

import defaultConfig                                          from '../config.json';

import * as corepackUtils                                     from './corepackUtils';
import * as debugUtils                                        from './debugUtils';
import * as folderUtils                                       from './folderUtils';
import type {NodeError}                                       from './nodeUtils';
import * as semverUtils                                       from './semverUtils';
import {Config, Descriptor, Locator}                          from './types';
import {SupportedPackageManagers, SupportedPackageManagerSet} from './types';

export type PreparedPackageManagerInfo = Awaited<ReturnType<Engine[`ensurePackageManager`]>>;

export function getLastKnownGoodFile(flag = `r`) {
  return fs.promises.open(path.join(folderUtils.getInstallFolder(), `lastKnownGood.json`), flag);
}

export async function getJSONFileContent(fh: FileHandle) {
  let lastKnownGood: unknown;
  try {
    lastKnownGood = JSON.parse(await fh.readFile(`utf8`));
  } catch {
    // Ignore errors; too bad
    return undefined;
  }

  return lastKnownGood;
}

async function overwriteJSONFileContent(fh: FileHandle, content: unknown) {
  await fh.truncate(0);
  await fh.write(`${JSON.stringify(content, null, 2)}\n`, 0);
}

export function getLastKnownGoodFromFileContent(lastKnownGood: unknown, packageManager: string) {
  if (typeof lastKnownGood === `object` && lastKnownGood !== null &&
    Object.hasOwn(lastKnownGood, packageManager)) {
    const override = (lastKnownGood as any)[packageManager];
    if (typeof override === `string`) {
      return override;
    }
  }
  return undefined;
}

export async function activatePackageManagerFromFileHandle(lastKnownGoodFile: FileHandle, lastKnownGood: unknown, locator: Locator) {
  if (typeof lastKnownGood !== `object` || lastKnownGood === null)
    lastKnownGood = {};

  (lastKnownGood as Record<string, string>)[locator.name] = locator.reference;

  debugUtils.log(`Setting ${locator.name}@${locator.reference} as Last Known Good version`);
  await overwriteJSONFileContent(lastKnownGoodFile, lastKnownGood);
}

export class Engine {
  constructor(public config: Config = defaultConfig as Config) {
  }

  getPackageManagerFor(binaryName: string): SupportedPackageManagers | null {
    for (const packageManager of SupportedPackageManagerSet) {
      for (const rangeDefinition of Object.values(this.config.definitions[packageManager]!.ranges)) {
        const bins = Array.isArray(rangeDefinition.bin)
          ? rangeDefinition.bin
          : Object.keys(rangeDefinition.bin);

        if (bins.includes(binaryName)) {
          return packageManager;
        }
      }
    }

    return null;
  }

  getPackageManagerSpecFor(locator: Locator) {
    const definition = this.config.definitions[locator.name];
    if (typeof definition === `undefined`)
      throw new UsageError(`This package manager (${locator.name}) isn't supported by this corepack build`);

    const ranges = Object.keys(definition.ranges).reverse();
    const range = ranges.find(range => semverUtils.satisfiesWithPrereleases(locator.reference, range));
    if (typeof range === `undefined`)
      throw new Error(`Assertion failed: Specified resolution (${locator.reference}) isn't supported by any of ${ranges.join(`, `)}`);

    return definition.ranges[range];
  }

  getBinariesFor(name: SupportedPackageManagers) {
    const binNames = new Set<string>();

    for (const rangeDefinition of Object.values(this.config.definitions[name]!.ranges)) {
      const bins = Array.isArray(rangeDefinition.bin)
        ? rangeDefinition.bin
        : Object.keys(rangeDefinition.bin);

      for (const name of bins) {
        binNames.add(name);
      }
    }

    return binNames;
  }

  async getDefaultDescriptors() {
    const locators: Array<Descriptor> = [];

    for (const name of SupportedPackageManagerSet as Set<SupportedPackageManagers>)
      locators.push({name, range: await this.getDefaultVersion(name)});

    return locators;
  }

  async getDefaultVersion(packageManager: SupportedPackageManagers) {
    const definition = this.config.definitions[packageManager];
    if (typeof definition === `undefined`)
      throw new UsageError(`This package manager (${packageManager}) isn't supported by this corepack build`);

    let emptyFile = false;
    const lastKnownGoodFile = await getLastKnownGoodFile(`r+`).catch(err => {
      if ((err as NodeError)?.code === `ENOENT`) {
        emptyFile = true;
        return getLastKnownGoodFile(`w`);
      }

      throw err;
    });
    try {
      const lastKnownGood = emptyFile || await getJSONFileContent(lastKnownGoodFile);
      const lastKnownGoodForThisPackageManager = getLastKnownGoodFromFileContent(lastKnownGood, packageManager);
      if (lastKnownGoodForThisPackageManager)
        return lastKnownGoodForThisPackageManager;

      if (process.env.COREPACK_DEFAULT_TO_LATEST === `0`)
        return definition.default;

      const reference = await corepackUtils.fetchLatestStableVersion(definition.fetchLatestFrom);

      await activatePackageManagerFromFileHandle(lastKnownGoodFile, lastKnownGood, {
        name: packageManager,
        reference,
      });

      return reference;
    } finally {
      await lastKnownGoodFile.close();
    }
  }

  async activatePackageManager(locator: Locator) {
    let emptyFile = false;
    const lastKnownGoodFile = await getLastKnownGoodFile(`r+`).catch(err => {
      if ((err as NodeError)?.code === `ENOENT`) {
        emptyFile = true;
        return getLastKnownGoodFile(`w`);
      }

      throw err;
    });
    try {
      await activatePackageManagerFromFileHandle(lastKnownGoodFile, emptyFile || await getJSONFileContent(lastKnownGoodFile), locator);
    } finally {
      await lastKnownGoodFile.close();
    }
  }

  async ensurePackageManager(locator: Locator) {
    const spec = this.getPackageManagerSpecFor(locator);

    const packageManagerInfo = await corepackUtils.installVersion(folderUtils.getInstallFolder(), locator, {
      spec,
    });

    return {
      ...packageManagerInfo,
      locator,
      spec,
    };
  }

  async fetchAvailableVersions() {

  }

  async resolveDescriptor(descriptor: Descriptor, {allowTags = false, useCache = true}: {allowTags?: boolean, useCache?: boolean} = {}) {
    const definition = this.config.definitions[descriptor.name];
    if (typeof definition === `undefined`)
      throw new UsageError(`This package manager (${descriptor.name}) isn't supported by this corepack build`);

    let finalDescriptor = descriptor;
    if (!semver.valid(descriptor.range) && !semver.validRange(descriptor.range)) {
      if (!allowTags)
        throw new UsageError(`Packages managers can't be referenced via tags in this context`);

      // We only resolve tags from the latest registry entry
      const ranges = Object.keys(definition.ranges);
      const tagRange = ranges[ranges.length - 1];

      const packageManagerSpec = definition.ranges[tagRange];
      const registry = corepackUtils.getRegistryFromPackageManagerSpec(packageManagerSpec);

      const tags = await corepackUtils.fetchAvailableTags(registry);
      if (!Object.hasOwn(tags, descriptor.range))
        throw new UsageError(`Tag not found (${descriptor.range})`);

      finalDescriptor = {
        name: descriptor.name,
        range: tags[descriptor.range],
      };
    }

    // If a compatible version is already installed, no need to query one
    // from the remote listings
    const cachedVersion = await corepackUtils.findInstalledVersion(folderUtils.getInstallFolder(), finalDescriptor);
    if (cachedVersion !== null && useCache)
      return {name: finalDescriptor.name, reference: cachedVersion};

    // If the user asked for a specific version, no need to request the list of
    // available versions from the registry.
    if (semver.valid(finalDescriptor.range))
      return {name: finalDescriptor.name, reference: finalDescriptor.range};

    const versions = await Promise.all(Object.keys(definition.ranges).map(async range => {
      const packageManagerSpec = definition.ranges[range];
      const registry = corepackUtils.getRegistryFromPackageManagerSpec(packageManagerSpec);

      const versions = await corepackUtils.fetchAvailableVersions(registry);
      return versions.filter(version => semverUtils.satisfiesWithPrereleases(version, finalDescriptor.range));
    }));

    const highestVersion = [...new Set(versions.flat())].sort(semver.rcompare);
    if (highestVersion.length === 0)
      return null;

    return {name: finalDescriptor.name, reference: highestVersion[0]};
  }
}
