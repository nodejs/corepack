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
  describe(`should update the "packageManager" field from the current project`, () => {
    it(`to the same major if no devEngines range`, async () => {
      await xfs.mktempPromise(async cwd => {
        await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
          packageManager: `yarn@2.1.0`,
        });

        await expect(runCli(cwd, [`up`])).resolves.toMatchObject({
          exitCode: 0,
          stderr: ``,
          stdout: expect.stringMatching(/^Installing yarn@2\.4\.3 in the project\.\.\.\n\n(.*\n)+➤ YN0000: Done in \d+s \d+ms\n$/),
        });

        await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toMatchObject({
          packageManager: `yarn@2.4.3+sha512.8dd9fedc5451829619e526c56f42609ad88ae4776d9d3f9456d578ac085115c0c2f0fb02bb7d57fd2e1b6e1ac96efba35e80a20a056668f61c96934f67694fd0`,
        });

        await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
          exitCode: 0,
          stdout: `2.4.3\n`,
          stderr: ``,
        });
      });
    });

    it(`to whichever range devEngines defines`, async () => {
      await xfs.mktempPromise(async cwd => {
        await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
          packageManager: `yarn@1.1.0`,
          devEngines: {
            packageManager: {
              name: `yarn`,
              version: `1.x || 2.x`,
            },
          },
        });

        await expect(runCli(cwd, [`up`])).resolves.toMatchObject({
          exitCode: 0,
          stderr: ``,
          stdout: expect.stringMatching(/^Installing yarn@2\.4\.3 in the project\.\.\.\n\n(.*\n)+➤ YN0000: Done in \d+s \d+ms\n$/),
        });

        await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toMatchObject({
          packageManager: `yarn@2.4.3+sha512.8dd9fedc5451829619e526c56f42609ad88ae4776d9d3f9456d578ac085115c0c2f0fb02bb7d57fd2e1b6e1ac96efba35e80a20a056668f61c96934f67694fd0`,
        });

        await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
          exitCode: 0,
          stdout: `2.4.3\n`,
          stderr: ``,
        });
      });
    });

    it(`to whichever range devEngines defines even if onFail is set to ignore`, async () => {
      await xfs.mktempPromise(async cwd => {
        await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
          packageManager: `pnpm@10.1.0`,
          devEngines: {
            packageManager: {
              name: `yarn`,
              version: `1.x || 2.x`,
              onFail: `ignore`,
            },
          },
        });

        await expect(runCli(cwd, [`up`])).resolves.toMatchObject({
          exitCode: 0,
          stderr: ``,
          stdout: expect.stringMatching(/^Installing yarn@2\.4\.3 in the project\.\.\.\n\n(.*\n)+➤ YN0000: Done in \d+s \d+ms\n$/),
        });

        await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toMatchObject({
          packageManager: `yarn@2.4.3+sha512.8dd9fedc5451829619e526c56f42609ad88ae4776d9d3f9456d578ac085115c0c2f0fb02bb7d57fd2e1b6e1ac96efba35e80a20a056668f61c96934f67694fd0`,
        });

        await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
          exitCode: 0,
          stdout: `2.4.3\n`,
          stderr: ``,
        });
      });
    });

    it(`should fail if no top-level 'packageManager' field`, async () => {
      await xfs.mktempPromise(async cwd => {
        process.env.NO_COLOR = `1`;
        await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
          devEngines: {
            packageManager: {
              name: `yarn`,
              version: `1.x || 2.x`,
            },
          },
        });

        await expect(runCli(cwd, [`up`])).resolves.toMatchObject({
          exitCode: 1,
          stderr: ``,
          stdout: `Usage Error: Invalid package manager specification in package.json (yarn@1.x || 2.x); expected a semver version\n\n$ corepack up\n`,
        });
      });
    });
  });
});
