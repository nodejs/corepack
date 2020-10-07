import cmdShim                      from '@zkochan/cmd-shim';
import fs                           from 'fs';
import path                         from 'path';

import {Engine}                     from './sources/Engine';
import {SupportedPackageManagerSet} from './sources/types';

const engine = new Engine();

const distDir = path.join(__dirname, `dist`);
const shimsDir = path.join(__dirname, `shims`);

async function main() {
  for (const packageManager of SupportedPackageManagerSet) {
    const binSet = engine.getBinariesFor(packageManager);

    for (const binaryName of binSet) {
      const entryPath = path.join(distDir, `${binaryName}.js`);
      const entryScript = [
        `#!/usr/bin/env node\n`,
        `require('./corepack').runMain(['${packageManager}', '${binaryName}', ...process.argv.slice(2)]);\n`,
      ].join(``);

      fs.writeFileSync(entryPath, entryScript);
      fs.chmodSync(entryPath, 0o755);
    }
  }

  for (const binaryName of fs.readdirSync(distDir))
    await cmdShim(path.join(distDir, binaryName), path.join(shimsDir, path.basename(binaryName, `.js`)), {createCmdFile: true});

  console.log(`All shims have been generated.`);
}

main().catch(err => {
  console.log(err.stack);
  process.exitCode = 1;
});
