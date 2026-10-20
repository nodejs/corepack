import type {ParsePackageManagerSpecOptions, ResolvePackageManagerOptions} from '../api.d.ts';
import type {PackageManagerDescriptor, PackageManagerLocator}              from '../api.d.ts';
import type {SupportedPackageManager}                                      from '../api.d.ts';

import {Engine}                                                            from './Engine.ts';
import {parseSpec}                                                         from './specUtils.ts';
import {SupportedPackageManagerSet}                                        from './types.ts';

export function getSupportedPackageManagers(): Array<SupportedPackageManager> {
  return [...SupportedPackageManagerSet];
}

export function parsePackageManagerSpec(raw: unknown, {enforceExactVersion = false}: ParsePackageManagerSpecOptions = {}): PackageManagerDescriptor {
  return parseSpec(raw, `corepack/api`, {enforceExactVersion});
}

export async function resolvePackageManager(raw: unknown, {allowTags = true, useCache = true}: ResolvePackageManagerOptions = {}): Promise<PackageManagerLocator | null> {
  const descriptor = parsePackageManagerSpec(raw);
  return await new Engine().resolveDescriptor(descriptor, {allowTags, useCache});
}
