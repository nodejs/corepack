import {describe, beforeEach, it, expect} from '@jest/globals';
import {ppath, xfs, npath}                from '@yarnpkg/fslib';
import process                            from 'node:process';

import {runCli}                           from './_runCli';

beforeEach(async () => {
  // `process.env` is reset after each tests in setupTests.js.
  process.env.COREPACK_HOME = npath.fromPortablePath(await xfs.mktempPromise());
  process.env.COREPACK_DEFAULT_TO_LATEST = `0`;
});

describe(`UseCommand`, () => {
  it(`should set the package manager in the current project`, async () => {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
        packageManager: `yarn@1.0.0`,
      });

      await expect(runCli(cwd, [`use`, `yarn@1.22.4`])).resolves.toMatchObject({
        exitCode: 0,
      });

      await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toMatchObject({
        packageManager: `yarn@1.22.4+sha256.bc5316aa110b2f564a71a3d6e235be55b98714660870c5b6b2d2d3f12587fb58`,
      });

      await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
        exitCode: 0,
        stdout: `1.22.4\n`,
      });
    });
  });

  it(`should create a package.json if absent`, async () => {
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`use`, `yarn@1.22.4`])).resolves.toMatchObject({
        exitCode: 0,
        stderr: `warning package.json: No license field\nwarning No license field\n`,
      });

      await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toMatchObject({
        packageManager: `yarn@1.22.4+sha256.bc5316aa110b2f564a71a3d6e235be55b98714660870c5b6b2d2d3f12587fb58`,
      });

      await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
        exitCode: 0,
        stdout: `1.22.4\n`,
        stderr: ``,
      });

      // Ensure Corepack is able to detect package.json in parent directory
      const subfolder = ppath.join(cwd, `subfolder`);
      await xfs.mkdirPromise(subfolder);

      await expect(runCli(subfolder, [`use`, `yarn@2.2.2`])).resolves.toMatchObject({
        exitCode: 0,
        stderr: ``,
      });
      await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
        exitCode: 0,
        stdout: `2.2.2\n`,
        stderr: ``,
      });
    });
  });
});
