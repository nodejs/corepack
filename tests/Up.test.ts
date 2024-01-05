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
        packageManager: `yarn@2.1.0`,
      });

      await expect(runCli(cwd, [`up`])).resolves.toMatchObject({
        exitCode: 0,
        stderr: ``,
      });

      await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toMatchObject({
        packageManager: `yarn@2.4.3+sha512.8dd9fedc5451829619e526c56f42609ad88ae4776d9d3f9456d578ac085115c0c2f0fb02bb7d57fd2e1b6e1ac96efba35e80a20a056668f61c96934f67694fd0`,
      });

      await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
        exitCode: 0,
        stdout: `2.4.3\n`,
      });
    });
  });
});
