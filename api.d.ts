export type SupportedPackageManager = `npm` | `pnpm` | `yarn`;

export interface PackageManagerDescriptor {
  name: string;
  range: string;
}

export interface PackageManagerLocator {
  name: string;
  reference: string;
}

export interface ParsePackageManagerSpecOptions {
  /** Require an exact version instead of accepting tags, ranges, or bare names. Defaults to false. */
  enforceExactVersion?: boolean;
}

export interface ResolvePackageManagerOptions {
  /** Allow registry tags such as `latest`. Defaults to true. */
  allowTags?: boolean;
  /** Prefer an installed version satisfying the requested range. Defaults to true. */
  useCache?: boolean;
}

/** Return a new array of the package managers supported by this Corepack build. */
export function getSupportedPackageManagers(): Array<SupportedPackageManager>;

/** Parse a specification without network access. Throws on invalid input; does not check release existence. */
export function parsePackageManagerSpec(raw: unknown, options?: ParsePackageManagerSpecOptions): PackageManagerDescriptor;

/** Resolve a specification without installing or running it. Returns null if no version matches a range. */
export function resolvePackageManager(raw: unknown, options?: ResolvePackageManagerOptions): Promise<PackageManagerLocator | null>;
