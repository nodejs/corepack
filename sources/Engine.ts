import {UsageError}                                           from 'clipanion';
import fs                                                     from 'fs';
import path                                                   from 'path';
import semver                                                 from 'semver';

import defaultConfig                                          from '../config.json';

import * as folderUtils                                       from './folderUtils';
import * as pmmUtils                                          from './pmmUtils';
import * as semverUtils                                       from './semverUtils';
import {SupportedPackageManagers, SupportedPackageManagerSet} from './types';
import {Config, Descriptor, Locator}                          from './types';


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

    let lastKnownGood: unknown;
    try {
      lastKnownGood = JSON.parse(await fs.promises.readFile(this.getLastKnownGoodFile(), `utf8`));
    } catch {
      // Ignore errors; too bad
    }

    if (typeof lastKnownGood !== `object` || lastKnownGood === null)
      return definition.default;

    if (!Object.prototype.hasOwnProperty.call(lastKnownGood, packageManager))
      return definition.default;

    const override = (lastKnownGood as any)[packageManager];
    if (typeof override !== `string`)
      return definition.default;

    return override;
  }

  async activatePackageManager(locator: Locator) {
    const lastKnownGoodFile = this.getLastKnownGoodFile();

    let lastKnownGood;
    try {
      lastKnownGood = JSON.parse(await fs.promises.readFile(lastKnownGoodFile, `utf8`));
    } catch {
      // Ignore errors; too bad
    }

    if (typeof lastKnownGood !== `object` || lastKnownGood === null)
      lastKnownGood = {};

    lastKnownGood[locator.name] = locator.reference;

    await fs.promises.mkdir(path.dirname(lastKnownGoodFile), {recursive: true});
    await fs.promises.writeFile(lastKnownGoodFile, `${JSON.stringify(lastKnownGood, null, 2)}\n`);
  }

  async ensurePackageManager(locator: Locator) {
    const definition = this.config.definitions[locator.name];
    if (typeof definition === `undefined`)
      throw new UsageError(`This package manager (${locator.name}) isn't supported by this corepack build`);

    const ranges = Object.keys(definition.ranges).reverse();
    const range = ranges.find(range => semverUtils.satisfiesWithPrereleases(locator.reference, range));
    if (typeof range === `undefined`)
      throw new Error(`Assertion failed: Specified resolution (${locator.reference}) isn't supported by any of ${ranges.join(`, `)}`);

    const installedLocation = await pmmUtils.installVersion(folderUtils.getInstallFolder(), locator, {
      spec: definition.ranges[range],
    });

    return {
      location: installedLocation,
      spec: definition.ranges[range],
    };
  }

  async resolveDescriptor(descriptor: Descriptor, {allowTags = false, useCache = true}: {allowTags?: boolean, useCache?: boolean} = {}) {
    const definition = this.config.definitions[descriptor.name];
    if (typeof definition === `undefined`)
      throw new UsageError(`This package manager (${descriptor.name}) isn't supported by this corepack build`);

    let finalDescriptor = descriptor;
    if (descriptor.range.match(/^[a-z-]+$/)) {
      if (!allowTags)
        throw new UsageError(`Packages managers can't be referended via tags in this context`);

      // We only resolve tags from the latest registry entry
      const ranges = Object.keys(definition.ranges);
      const tagRange = ranges[ranges.length - 1];

      const tags = await pmmUtils.fetchAvailableTags(definition.ranges[tagRange].registry);
      if (!Object.prototype.hasOwnProperty.call(tags, descriptor.range))
        throw new UsageError(`Tag not found (${descriptor.range})`);

      finalDescriptor = {
        name: descriptor.name,
        range: tags[descriptor.range],
      };
    }

    // If a compatible version is already installed, no need to query one
    // from the remote listings
    const cachedVersion = await pmmUtils.findInstalledVersion(folderUtils.getInstallFolder(), finalDescriptor);
    if (cachedVersion !== null && useCache)
      return {name: finalDescriptor.name, reference: cachedVersion};

    const candidateRangeDefinitions = Object.keys(definition.ranges).filter(range => {
      return semverUtils.satisfiesWithPrereleases(finalDescriptor.range, range);
    });

    const tagResolutions = await Promise.all(candidateRangeDefinitions.map(async range => {
      return [range, await pmmUtils.fetchAvailableVersions(definition.ranges[range].registry)] as const;
    }));

    // If a version is available under multiple strategies (for example if
    // Yarn is published to both the v1 package and git), we only care
    // about the latest one
    const resolutionMap = new Map();
    for (const [range, resolutions] of tagResolutions)
      for (const entry of resolutions)
        resolutionMap.set(entry, range);

    const candidates = [...resolutionMap.keys()];
    const maxSatisfying = semver.maxSatisfying(candidates, finalDescriptor.range);
    if (maxSatisfying === null)
      return null;

    return {name: finalDescriptor.name, reference: maxSatisfying};
  }

  private getLastKnownGoodFile() {
    return path.join(folderUtils.getInstallFolder(), `lastKnownGood.json`);
  }
}
