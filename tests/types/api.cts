import * as api from 'corepack/api';

const managers: Array<api.SupportedPackageManager> = api.getSupportedPackageManagers();
const descriptor: api.PackageManagerDescriptor = api.parsePackageManagerSpec(`yarn@3.2.3`);
const locator: Promise<api.PackageManagerLocator | null> = api.resolvePackageManager(`yarn@3.2.3`);

void managers;
void descriptor;
void locator;
