import {execFile}   from 'node:child_process';
import {promisify}  from 'node:util';
import {expect, it} from 'vitest';

const exec = promisify(execFile);

it(`provides TypeScript declarations for CommonJS and ES module callers`, async () => {
  const {stdout, stderr} = await exec(process.execPath, [
    require.resolve(`typescript/bin/tsc`),
    `--noEmit`, `--strict`, `--skipLibCheck`,
    `--module`, `node16`, `--moduleResolution`, `node16`, `--target`, `es2022`,
    `tests/types/api.mts`, `tests/types/api.cts`,
  ]);
  expect(stdout).toBe(``);
  expect(stderr).toBe(``);
});

it.each([`commonjs`, `module`])(`loads the public API from %s without invoking the CLI`, async moduleType => {
  const script = moduleType === `module`
    ? `import {getSupportedPackageManagers, parsePackageManagerSpec, resolvePackageManager} from 'corepack/api';`
    : `const {getSupportedPackageManagers, parsePackageManagerSpec, resolvePackageManager} = require('corepack/api');`;
  const {stdout, stderr} = await exec(process.execPath, [`--input-type=${moduleType}`, `-e`, `${script}
    const assert = ${moduleType === `module` ? `(await import('node:assert/strict')).default` : `require('node:assert/strict')`};
    assert.deepEqual(getSupportedPackageManagers(), ['npm', 'pnpm', 'yarn']);
    assert.deepEqual(parsePackageManagerSpec('npm@latest'), {name: 'npm', range: 'latest'});
    resolvePackageManager('yarn@3.2.3').then(locator => {
      assert.deepEqual(locator, {name: 'yarn', reference: '3.2.3'});
    }).catch(error => { console.error(error); process.exitCode = 1; });
  `]);
  expect(stdout).toBe(``);
  expect(stderr).toBe(``);
});
