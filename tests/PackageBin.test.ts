import type {Filename}                    from '@yarnpkg/fslib';
import {npath, ppath, xfs}                from '@yarnpkg/fslib';
import {beforeEach, describe, expect, it} from 'vitest';

import {runCli}                           from './_runCli.ts';

beforeEach(async () => {
  const home = await xfs.mktempPromise();
  process.env.COREPACK_HOME = npath.fromPortablePath(home);
  process.env.COREPACK_DEFAULT_TO_LATEST = `0`;
  process.env.AUTH_TYPE = `COREPACK_NPM_TOKEN`;
  process.env.TEST_INTEGRITY = `valid`;
  return () => xfs.removePromise(home, {recursive: true});
});

describe(`tarball package executable paths`, () => {
  it(`runs moved pnpm and pnpx entry points and reuses them offline`, async () => {
    process.env.TEST_PNPM_BIN_LAYOUT = JSON.stringify({pnpm: `dist/pnpm.mjs`, pnpx: `dist/pnpx.mjs`, npm: `../outside.js`});
    await xfs.mktempPromise(async cwd => {
      for (const name of [`pnpm`, `pnpx`]) {
        await expect(runCli(cwd, [`${name}@11.9998.9999`, `--version`], true)).resolves.toEqual({
          exitCode: 0, stdout: `${name}: moved entry --version\n`, stderr: ``,
        });
      }
      const cache = ppath.join(npath.toPortablePath(process.env.COREPACK_HOME!), `v1/pnpm/11.9998.9999`);
      await expect(xfs.readJsonPromise(ppath.join(cache, `.corepack` as Filename))).resolves.toMatchObject({
        bin: {pnpm: `dist/pnpm.mjs`, pnpx: `dist/pnpx.mjs`},
        hash: expect.stringMatching(/^sha512\.[a-f0-9]{128}$/),
      });
      process.env.COREPACK_ENABLE_NETWORK = `0`;
      await expect(runCli(cwd, [`pnpm@11.9998.9999`, `exec`, `hello`])).resolves.toEqual({
        exitCode: 0, stdout: `pnpm: moved entry exec hello\n`, stderr: ``,
      });
    });
  });

  it(`accepts string bins when optional aliases are absent`, async () => {
    process.env.TEST_PNPM_BIN_LAYOUT = JSON.stringify(`dist/pnpm.mjs`);
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`pnpm@11.9998.9999`, `--version`], true)).resolves.toEqual({
        exitCode: 0, stdout: `pnpm: moved entry --version\n`, stderr: ``,
      });
    });
  });

  it.each([`../outside.js`, `missing.js`, `dist`])(`rejects invalid entry '%s' without caching or running it`, async file => {
    process.env.TEST_PNPM_BIN_LAYOUT = JSON.stringify({pnpm: file});
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`pnpm@11.9998.9999`, `--version`], true)).resolves.toMatchObject({
        exitCode: 1, stdout: ``, stderr: expect.stringContaining(`bin 'pnpm'`),
      });
      await expect(xfs.readdirPromise(ppath.join(npath.toPortablePath(process.env.COREPACK_HOME!), `v1`))).resolves.toEqual([]);
    });
  });
});
