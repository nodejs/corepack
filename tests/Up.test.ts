import {ppath, xfs, npath}                from '@yarnpkg/fslib';
import process                            from 'node:process';
import {describe, beforeEach, it, expect} from 'vitest';

import {runCli}                           from './_runCli';

beforeEach(async () => {
  // `process.env` is reset after each tests in setupTests.js.
  process.env.COREPACK_HOME = npath.fromPortablePath(await xfs.mktempPromise());
  process.env.COREPACK_DEFAULT_TO_LATEST = `0`;
});

describe(`UpCommand`, () => {
  it(`should upgrade the package manager from the current project`, async () => {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
        packageManager: `pnpm@7.0.0`,
      });

      await expect(runCli(cwd, [`up`])).resolves.toMatchObject({
        exitCode: 0,
        stderr: ``,
      });

      await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toMatchObject({
        packageManager: `pnpm@7.33.7+sha512.7afe2410642b39c698df46da4ce5c7231a5cce360698d69f8cf8f42257d40b3e43f231053b07b8de849fd4ffbf4a71ff57b835137777a352388f3d3da747200e`,
      });

      await expect(runCli(cwd, [`pnpm`, `--version`])).resolves.toMatchObject({
        exitCode: 0,
        stdout: `7.33.7\n`,
      });
    });
  });
});
