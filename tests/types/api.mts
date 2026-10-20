import {getSupportedPackageManagers, parsePackageManagerSpec, resolvePackageManager} from 'corepack/api';
import type {PackageManagerDescriptor, PackageManagerLocator}                        from 'corepack/api';
import type {SupportedPackageManager}                                                from 'corepack/api';

const managers: Array<SupportedPackageManager> = getSupportedPackageManagers();
const descriptor: PackageManagerDescriptor = parsePackageManagerSpec(`npm@latest`, {enforceExactVersion: false});
const locator: Promise<PackageManagerLocator | null> = resolvePackageManager(`npm@latest`, {allowTags: true, useCache: false});

// @ts-expect-error Only supported manager names are allowed in this list.
managers.push(`unsupported`);
// @ts-expect-error The exact-version option is a boolean.
parsePackageManagerSpec(`npm@latest`, {enforceExactVersion: `true`});
// @ts-expect-error Resolution is asynchronous and may find no matching version.
const resolved: PackageManagerLocator = locator;

void descriptor;
void resolved;
