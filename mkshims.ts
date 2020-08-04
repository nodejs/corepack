import cmdShim from '@zkochan/cmd-shim';

import config from './config.json';
import { SupportedPackageManagers } from 'sources/types';

async function main() {
    for (const packageManager of Object.keys(config.definitions) as SupportedPackageManagers[]) {
        const binSet = new Set<string>();

        for (const spec of Object.values(config.definitions[packageManager].ranges)) {
            if (Array.isArray(spec.bin)) {
                for (const entry of spec.bin) {
                    binSet.add(entry);
                }
            } else {
                for (const entry of Object.keys(spec.bin)) {
                    binSet.add(entry);
                }
            }
        }

        for (const binaryName of binSet) {
            await cmdShim(`${__dirname}/dist/main.js`, `${__dirname}/shims/${binaryName}`, {
                progArgs: [packageManager, binaryName],
            });
        }
    }

    console.log(`All shims have been generated.`);
}

main().catch(err => {
    console.error(err.stack);
    process.exitCode = 1;
});
