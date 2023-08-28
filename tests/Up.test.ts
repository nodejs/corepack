import {describe, beforeEach, it, expect} from '@jest/globals';
import {ppath, xfs, npath}                from '@yarnpkg/fslib';
import process                            from 'node:process';

import {runCli}                           from './_runCli';

beforeEach(async () => {
  process.env.COREPACK_HOME = npath.fromPortablePath(await xfs.mktempPromise());
  process.env.COREPACK_DEFAULT_TO_LATEST = `0`;
});

describe(`UpCommand`, () => {
  it(`should upgrade the package manager from the current project`, async () => {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
        packageManager: `yarn@2.1.0`,
      });

      await expect(runCli(cwd, [`up`])).resolves.toMatchObject({
        exitCode: 0,
        stderr: ``,
      });

      await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toMatchObject({
        packageManager: `yarn@2.4.3+sha256.8c1575156cfa42112242cc5cfbbd1049da9448ffcdb5c55ce996883610ea983f`,
      });

      await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
        exitCode: 0,
        stdout: `2.4.3\n`,
      });
    });
  });
});
