import cmdShim                    from '@zkochan/cmd-shim';
import fs                         from 'fs';
import {SupportedPackageManagers} from 'sources/types';

import config                     from './config.json';

async function main() {
  for (const packageManager of Object.keys(config.definitions) as Array<SupportedPackageManagers>) {
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
      const entryPath = `${__dirname}/dist/${binaryName}.js`;
      const entryScript = [
        `#!/usr/bin/env node\n`,
        `require('./corepack').runMain(['${packageManager}', '${binaryName}', ...process.argv.slice(2)]);\n`,
      ].join(``);

      fs.writeFileSync(entryPath, entryScript);
      fs.chmodSync(entryPath, 0o755);

      await cmdShim(entryPath, `${__dirname}/shims/${binaryName}`, {createCmdFile: true});
    }
  }

  console.log(`All shims have been generated.`);
}

main().catch(err => {
  console.log(err.stack);
  process.exitCode = 1;
});
