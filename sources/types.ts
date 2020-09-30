export type BinSpec = {[key: string]: string};
export type BinList = Array<string>;

export enum SupportedPackageManagers {
  Npm = `npm`,
  Pnpm = `pnpm`,
  Yarn = `yarn`,
}

export const SupportedPackageManagerSet = new Set<SupportedPackageManagers>(
  Object.values(SupportedPackageManagers),
);

export function isSupportedPackageManager(value: string): value is SupportedPackageManagers {
  return SupportedPackageManagerSet.has(value as SupportedPackageManagers);
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
}

/**
 * The data structure found in config.json
 */
export interface Config {
  definitions: {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [name in SupportedPackageManagers]?: {
      /**
       * Defines the version that needs to be used when running commands within
       * projects that don't list any preference.
       */
      default: string;

      /**
       * Defines a set of commands that are fine to run even if the user isn't
       * in a project configured for the specified package manager. For instance,
       * we would use that to be able to run "pnpx" even inside Yarn projects.
       */
      transparent: {
        default?: string;
        commands: Array<Array<string>>;
      };

      /**
       * Defines how to retrieve the package manager's sources, depending on
       * the chosen version.
       */
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
