import {UsageError, Definition} from 'clipanion';
import semver from 'semver';

import defaultConfig from '../config.json';

import * as folderUtils from './folderUtils';
import * as pmmUtils from './pmmUtils';
import {Config, Descriptor, Locator, SupportedPackageManagers} from './types';


export class Engine {
    constructor(private config: Config = defaultConfig as Config) {
    }

    getDefaultVersion(packageManager: SupportedPackageManagers) {
        const definition = this.config.definitions[packageManager];
        if (typeof definition === `undefined`)
            throw new UsageError(`This package manager (${packageManager}) isn't supported by this pmm build`);
        
        return definition.default;
    }

    async ensurePackageManager(locator: Locator) {
        const definition = this.config.definitions[locator.name];
        if (typeof definition === `undefined`)
            throw new UsageError(`This package manager (${locator.name}) isn't supported by this pmm build`);

        const ranges = Object.keys(definition.ranges).reverse();
        const range = ranges.find(range => semver.satisfies(locator.reference, range));
        if (typeof range === `undefined`)
            throw new Error(`Assertion failed: Specified resolution (${locator.reference}) isn't supported by any of ${ranges.join(`, `)}`);

        return await pmmUtils.installVersion(folderUtils.getInstallFolder(), locator, {
            spec: definition.ranges[range],
        });
    }

    async resolveDescriptor(descriptor: Descriptor, {useCache = true}: {useCache?: boolean} = {}) {
        const definition = this.config.definitions[descriptor.name];
        if (typeof definition === `undefined`)
            throw new UsageError(`This package manager (${descriptor.name}) isn't supported by this pmm build`);

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
}
