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

export const SupportedPackageManagerSetWithoutNpm = new Set<SupportedPackageManagers>(
  Object.values(SupportedPackageManagers),
);

// npm is distributed with Node as a builtin; we don't want Corepack to override it unless the npm team is on board
SupportedPackageManagerSetWithoutNpm.delete(SupportedPackageManagers.Npm);

export function isSupportedPackageManager(value: string): value is SupportedPackageManagers {
  return SupportedPackageManagerSet.has(value as SupportedPackageManagers);
}

export interface NpmRegistrySpec {
  type: `npm`;
  package: string;
}

export interface UrlRegistrySpec {
  type: `url`;
  url: string;
  fields: {
    tags: string;
    versions: string;
  };
}

export type RegistrySpec =
    | NpmRegistrySpec
    | UrlRegistrySpec;

/**
 * Defines how the package manager is meant to be downloaded and accessed.
 */
export interface PackageManagerSpec {
  url: string;
  bin: BinSpec | BinList;
  registry: RegistrySpec;
  npmRegistry?: NpmRegistrySpec;
  commands?: {
    use?: Array<string>;
  };
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
       * Defines how to fetch the latest version from a remote registry.
       */
      fetchLatestFrom: RegistrySpec;

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
