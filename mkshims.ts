import cmdShim                      from '@zkochan/cmd-shim';
import fs                           from 'fs';
import path                         from 'path';

import {Engine}                     from './sources/Engine';
import {SupportedPackageManagerSet} from './sources/types';

const EXCLUDE_SHIMS = new Set([
  `vcc.js`,
]);

const engine = new Engine();

const distDir = path.join(__dirname, `dist`);
const shimsDir = path.join(__dirname, `shims`);

const physicalNodewinDir = path.join(shimsDir, `nodewin`);
const virtualNodewinDir = path.join(physicalNodewinDir, `node_modules/corepack`);

fs.mkdirSync(distDir, {recursive: true});
fs.mkdirSync(shimsDir, {recursive: true});
fs.mkdirSync(physicalNodewinDir, {recursive: true});

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

  for (const binaryName of fs.readdirSync(distDir)) {
    if (EXCLUDE_SHIMS.has(binaryName))
      continue;

    await cmdShim(path.join(distDir, binaryName), path.join(shimsDir, path.basename(binaryName, `.js`)), {createCmdFile: true});
  }

  // The Node distribution doesn't support symlinks, so they copy the shims into
  // the target folder. Since our shims have relative paths, it doesn't work
  // super well... To make this process easier, we ship with a set of shims
  // compatible for this use case. Not great, but better than text replacement
  // in batch scripts.

  // Last note: cmdShim generates shims with relative paths, so it doesn't matter
  // that the target files don't truly exist, as long as we mock the `stat` function.
  const remapPath = (p: string) => path.resolve(__dirname, path.relative(virtualNodewinDir, p));

  const easyStatFs = Object.assign(Object.create(fs), {
    readFile: (p: string, encoding: string, cb: (err: any, str: string) => void) => fs.readFile(remapPath(p), encoding, cb),
    stat: (p: string, cb: () => void) => fs.stat(remapPath(p), cb),
  });

  for (const binaryName of fs.readdirSync(distDir))
    await cmdShim(path.join(virtualNodewinDir, `dist/${binaryName}`), path.join(physicalNodewinDir, path.basename(binaryName, `.js`)), {createCmdFile: true, fs: easyStatFs});

  console.log(`All shims have been generated.`);
}

main().catch(err => {
  console.log(err.stack);
  process.exitCode = 1;
});
