import {UsageError}                                           from 'clipanion';
import fs                                                     from 'fs';
import path                                                   from 'path';
import semver                                                 from 'semver';

import defaultConfig                                          from '../config.json';

import * as folderUtils                                       from './folderUtils';
import * as pmmUtils                                          from './pmmUtils';
import {SupportedPackageManagers, SupportedPackageManagerSet} from './types';
import {Config, Descriptor, Locator}                          from './types';


export class Engine {
  constructor(public config: Config = defaultConfig as Config) {
  }

  getDefinitionFor(name: SupportedPackageManagers) {
    return this.config.definitions[name]!;
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

  async getElectedPackageManager() {
    let electedPackageManager: unknown;
    try {
      electedPackageManager = JSON.parse(await fs.promises.readFile(this.getLocalConfigFile(), `utf8`)).electedPackageManager;
    } catch {
      // Ignore errors; too bad
    }

    if (typeof electedPackageManager === `string` && SupportedPackageManagerSet.has(electedPackageManager as SupportedPackageManagers)) {
      return electedPackageManager as SupportedPackageManagers;
    } else {
      return null;
    }
  }

  async electPackageManager(packageManager: SupportedPackageManagers) {
    const localConfigFile = this.getLocalConfigFile();

    let localConfig;
    try {
      localConfig = JSON.parse(await fs.promises.readFile(localConfigFile, `utf8`));
    } catch {
      // Ignore errors; too bad
    }

    if (typeof localConfig !== `object` || localConfig === null)
      localConfig = {};

    localConfig.electedPackageManager = packageManager;

    await fs.promises.mkdir(path.dirname(localConfigFile), {recursive: true});
    await fs.promises.writeFile(localConfigFile, `${JSON.stringify(localConfig, null, 2)}\n`);
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
      lastKnownGood = JSON.parse(await fs.promises.readFile(this.getLocalConfigFile(), `utf8`)).lastKnownGood;
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
    const localConfigFile = this.getLocalConfigFile();

    let localConfig;
    try {
      localConfig = JSON.parse(await fs.promises.readFile(localConfigFile, `utf8`));
    } catch {
      // Ignore errors; too bad
    }

    if (typeof localConfig !== `object` || localConfig === null)
      localConfig = {};

    if (typeof localConfig.lastKnownGood !== `object` || localConfig.lastKnownGood === null)
      localConfig.lastKnownGood = {};

    localConfig.lastKnownGood[locator.name] = locator.reference;

    await fs.promises.mkdir(path.dirname(localConfigFile), {recursive: true});
    await fs.promises.writeFile(localConfigFile, `${JSON.stringify(localConfig, null, 2)}\n`);
  }

  async ensurePackageManager(locator: Locator) {
    const definition = this.config.definitions[locator.name];
    if (typeof definition === `undefined`)
      throw new UsageError(`This package manager (${locator.name}) isn't supported by this corepack build`);

    const ranges = Object.keys(definition.ranges).reverse();
    const range = ranges.find(range => semver.satisfies(locator.reference, range));
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

  async resolveDescriptor(descriptor: Descriptor, {useCache = true}: {useCache?: boolean} = {}) {
    const definition = this.config.definitions[descriptor.name];
    if (typeof definition === `undefined`)
      throw new UsageError(`This package manager (${descriptor.name}) isn't supported by this corepack build`);

    // If a compatible version is already installed, no need to query one
    // from the remote listings
    const cachedVersion = await pmmUtils.findInstalledVersion(folderUtils.getInstallFolder(), descriptor);
    if (cachedVersion !== null && useCache)
      return {name: descriptor.name, reference: cachedVersion};

    const candidateRangeDefinitions = Object.keys(definition.ranges).filter(range => {
      return semver.intersects(range, descriptor.range);
    });

    const tagResolutions = await Promise.all(candidateRangeDefinitions.map(async range => {
      return [range, await pmmUtils.fetchAvailableVersions(definition.ranges[range].tags)] as const;
    }));

    // If a version is available under multiple strategies (for example if
    // Yarn is published to both the v1 package and git), we only care
    // about the latest one
    const resolutionMap = new Map();
    for (const [range, resolutions] of tagResolutions)
      for (const entry of resolutions)
        resolutionMap.set(entry, range);

    const candidates = [...resolutionMap.keys()];
    const maxSatisfying = semver.maxSatisfying(candidates, descriptor.range);
    if (maxSatisfying === null)
      return null;

    return {name: descriptor.name, reference: maxSatisfying};
  }

  private getLocalConfigFile() {
    return path.join(folderUtils.getInstallFolder(), `localConfig.json`);
  }
}
