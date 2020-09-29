import cmdShim                      from '@zkochan/cmd-shim';
import fs                           from 'fs';

import {Engine}                     from './sources/Engine';
import {SupportedPackageManagerSet} from './sources/types';

const engine = new Engine();

async function main() {
  for (const packageManager of SupportedPackageManagerSet) {
    const binSet = engine.getBinariesFor(packageManager);

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
