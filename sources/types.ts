export type BinSpec = {[key: string]: string};
export type BinList = string[];

export enum SupportedPackageManagers {
    Npm = `npm`,
    Pnpm = `pnpm`,
    Yarn = `yarn`,
}

export const SupportedPackageManagerSet = new Set<string>(
    Object.values(SupportedPackageManagers),
);

export function isSupportedPackageManager(value: string): value is SupportedPackageManagers {
    return SupportedPackageManagerSet.has(value);
}

export interface NpmTagSpec {
    type: `npm`;
    package: string;
}

export interface GitTagSpec {
    type: `git`;
    repository: string;
    pattern: string;
}

export type TagSpec =
    | NpmTagSpec
    | GitTagSpec;

/**
 * Defines how the package manager is meant to be downloaded and accessed.
 */
export interface PackageManagerSpec {
    url: string;
    bin: BinSpec | BinList;
    tags: TagSpec;
};

/**
 * The data structure found in config.json
 */
export interface Config {
    definitions: {
        [name in SupportedPackageManagers]?: {
            default: string;
            ranges: {
                [range: string]: PackageManagerSpec;
            };
        };
    };
}

/**
 * A structure containing the information needed to locate the package
 * manager to use for the active project.
 */
export interface Descriptor {
    /**
     * The name of the package manager required.
     */
    name: SupportedPackageManagers;

    /**
     * The range of versions allowed.
     */
    range: string;
}

/**
 * 
 */
export interface Locator {
    /**
     * The name of the package manager required.
     */
    name: SupportedPackageManagers;

    /**
     * The exact version required.
     */
    reference: string;
}
