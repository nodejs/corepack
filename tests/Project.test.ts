import {ppath, xfs, npath}                from '@yarnpkg/fslib';
import process                            from 'node:process';
import {describe, beforeEach, it, expect} from 'vitest';

import {runCli}                           from './_runCli';

beforeEach(async () => {
  // `process.env` is reset after each tests in setupTests.js.
  process.env.COREPACK_HOME = npath.fromPortablePath(await xfs.mktempPromise());
  process.env.COREPACK_DEFAULT_TO_LATEST = `0`;
});

describe(`ProjectCommand`, () => {
  describe(`InstallSubcommand`, () => {
    it(`should install with npm`, async () => {
      await xfs.mktempPromise(async cwd => {
        await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
          packageManager: `npm@10.8.2`,
          dependencies: {
            ms: `2.1.3`,
          },
        });

        await expect(runCli(cwd, [`project`, `install`])).resolves.toMatchObject({
          exitCode: 0,
          stderr: ``,
        });

        const dir = await xfs.readdirPromise(cwd);
        expect(dir).toContain(`package-lock.json`);
        expect(dir).toContain(`node_modules`);
      });
    });

    it(`should install with pnpm`, async () => {
      await xfs.mktempPromise(async cwd => {
        await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
          packageManager: `pnpm@9.4.0`,
          dependencies: {
            ms: `2.1.3`,
          },
        });

        await expect(runCli(cwd, [`project`, `install`])).resolves.toMatchObject({
          exitCode: 0,
          stderr: ``,
        });

        const dir = await xfs.readdirPromise(cwd);
        expect(dir).toContain(`pnpm-lock.yaml`);
        expect(dir).toContain(`node_modules`);
      });
    });

    it(`should install with yarn`, async () => {
      await xfs.mktempPromise(async cwd => {
        await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
          packageManager: `yarn@2.1.0`,
          dependencies: {
            ms: `2.1.3`,
          },
        });

        await expect(runCli(cwd, [`project`, `install`])).resolves.toMatchObject({
          exitCode: 0,
          stderr: ``,
        });

        const dir = await xfs.readdirPromise(cwd);
        expect(dir).toContain(`yarn.lock`);
        expect(dir).toContain(`.pnp.js`);
      });
    });
  });
});
