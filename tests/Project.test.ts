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
          packageManager: `npm@6.14.2`,
          license: `MIT`,
          dependencies: {
            ms: `2.1.3`,
          },
        });

        await expect(runCli(cwd, [`project`, `install`])).resolves.toMatchObject({
          exitCode: 0,
          stdout: expect.stringMatching(/^(?!.*Error).*$/s),
          stderr: expect.stringContaining(`created a lockfile as package-lock.json`),
        });

        const dir = await xfs.readdirPromise(cwd);
        expect(dir).toContain(`package-lock.json`);
        expect(xfs.existsSync(ppath.join(cwd, `node_modules/ms/package.json`))).toBe(true)
      });
    });

    it(`should install with pnpm`, async () => {
      await xfs.mktempPromise(async cwd => {
        await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
          packageManager: `pnpm@5.8.0`,
          license: `MIT`,
          dependencies: {
            ms: `2.1.3`,
          },
        });

        await expect(runCli(cwd, [`project`, `install`])).resolves.toMatchObject({
          exitCode: 0,
          stdout: expect.stringMatching(/^(?!.*Error).*$/s),
          stderr: ``,
        });

        const dir = await xfs.readdirPromise(cwd);
        expect(dir).toContain(`pnpm-lock.yaml`);
        expect(xfs.existsSync(ppath.join(cwd, `node_modules/ms/package.json`))).toBe(true)
      });
    });

    it(`should install with yarn`, async () => {
      await xfs.mktempPromise(async cwd => {
        await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
          packageManager: `yarn@1.22.4`,
          license: `MIT`,
          dependencies: {
            ms: `2.1.3`,
          },
        });

        await expect(runCli(cwd, [`project`, `install`])).resolves.toMatchObject({
          exitCode: 0,
          stdout: expect.stringMatching(/^(?!.*Error).*$/s),
          stderr: ``,
        });

        const dir = await xfs.readdirPromise(cwd);
        expect(dir).toContain(`yarn.lock`);
        expect(xfs.existsSync(ppath.join(cwd, `node_modules/ms/package.json`))).toBe(true)
      });
    });
  });
});
