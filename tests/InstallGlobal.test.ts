import {ppath, xfs, npath}                from '@yarnpkg/fslib';
import process                            from 'node:process';
import {describe, beforeEach, it, expect} from 'vitest';

import {runCli}                           from './_runCli.ts';

beforeEach(async () => {
  const home = await xfs.mktempPromise();

  process.env.COREPACK_HOME = npath.fromPortablePath(home);
  process.env.COREPACK_DEFAULT_TO_LATEST = `0`;

  return async () => {
    await xfs.removePromise(home, {recursive: true});
  };
});

describe(`InstallGlobalCommand`, () => {
  it.each([
    `1.22.4`,
    `1.22.4+sha224.0d6eecaf4d82ec12566fdd97143794d0f0c317e0d652bd4d1b305430`,
  ])(`should report a cached and globally active version on repeated installs (%s)`, async version => {
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`install`, `--global`, `yarn@${version}`])).resolves.toEqual({
        exitCode: 0,
        stdout: `Installing yarn@${version}...\n`,
        stderr: ``,
      });

      const lastKnownGoodFile = ppath.join(npath.toPortablePath(process.env.COREPACK_HOME!), `lastKnownGood.json`);
      const before = await xfs.statPromise(lastKnownGoodFile);
      process.env.COREPACK_ENABLE_NETWORK = `0`;

      await expect(runCli(cwd, [`install`, `-g`, `yarn@${version}`])).resolves.toEqual({
        exitCode: 0,
        stdout: `yarn@${version} is the current version\n`,
        stderr: ``,
      });

      const after = await xfs.statPromise(lastKnownGoodFile);
      expect(after.mtimeMs).toBe(before.mtimeMs);
      await expect(xfs.readJsonPromise(lastKnownGoodFile)).resolves.toEqual({yarn: version});
      await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toEqual({
        exitCode: 0,
        stdout: `1.22.4\n`,
        stderr: ``,
      });
    });
  });

  it(`should report installation when activating a different cached version`, async () => {
    await xfs.mktempPromise(async cwd => {
      for (const version of [`1.22.4`, `1.0.0`]) {
        await expect(runCli(cwd, [`install`, `-g`, `yarn@${version}`])).resolves.toEqual({
          exitCode: 0,
          stdout: `Installing yarn@${version}...\n`,
          stderr: ``,
        });
      }

      process.env.COREPACK_ENABLE_NETWORK = `0`;
      await expect(runCli(cwd, [`install`, `-g`, `yarn@1.22.4`])).resolves.toEqual({
        exitCode: 0,
        stdout: `Installing yarn@1.22.4...\n`,
        stderr: ``,
      });
      await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toEqual({
        exitCode: 0,
        stdout: `1.22.4\n`,
        stderr: ``,
      });
    });
  });

  it(`should report installation when changing the active hash reference`, async () => {
    await xfs.mktempPromise(async cwd => {
      const version = `1.22.4+sha224.0d6eecaf4d82ec12566fdd97143794d0f0c317e0d652bd4d1b305430`;
      await expect(runCli(cwd, [`install`, `-g`, `yarn@${version}`])).resolves.toEqual({
        exitCode: 0,
        stdout: `Installing yarn@${version}...\n`,
        stderr: ``,
      });

      process.env.COREPACK_ENABLE_NETWORK = `0`;
      await expect(runCli(cwd, [`install`, `-g`, `yarn@1.22.4`])).resolves.toEqual({
        exitCode: 0,
        stdout: `Installing yarn@1.22.4...\n`,
        stderr: ``,
      });
      await expect(xfs.readJsonPromise(ppath.join(npath.toPortablePath(process.env.COREPACK_HOME!), `lastKnownGood.json`))).resolves.toEqual({
        yarn: `1.22.4`,
      });
    });
  });

  it(`should report installation when the globally active version is missing from the cache`, async () => {
    const home = npath.toPortablePath(process.env.COREPACK_HOME!);
    await xfs.writeJsonPromise(ppath.join(home, `lastKnownGood.json`), {yarn: `1.22.4`});

    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`install`, `-g`, `yarn@1.22.4`])).resolves.toEqual({
        exitCode: 0,
        stdout: `Installing yarn@1.22.4...\n`,
        stderr: ``,
      });

      process.env.COREPACK_ENABLE_NETWORK = `0`;
      await expect(runCli(cwd, [`install`, `-g`, `yarn@1.22.4`])).resolves.toEqual({
        exitCode: 0,
        stdout: `yarn@1.22.4 is the current version\n`,
        stderr: ``,
      });
    });
  });

  it(`should report installation when downloading also updates the default version`, async () => {
    process.env.COREPACK_DEFAULT_TO_LATEST = `1`;
    await xfs.writeJsonPromise(ppath.join(npath.toPortablePath(process.env.COREPACK_HOME!), `lastKnownGood.json`), {yarn: `1.0.0`});

    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`install`, `-g`, `yarn@1.22.4`])).resolves.toEqual({
        exitCode: 0,
        stdout: `Installing yarn@1.22.4...\n`,
        stderr: ``,
      });
    });
  });

  it(`should preserve cache-only output without activating a cached version`, async () => {
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`install`, `-g`, `yarn@1.0.0`])).resolves.toEqual({
        exitCode: 0,
        stdout: `Installing yarn@1.0.0...\n`,
        stderr: ``,
      });

      for (let attempt = 0; attempt < 2; attempt++) {
        await expect(runCli(cwd, [`install`, `-g`, `--cache-only`, `yarn@1.22.4`])).resolves.toEqual({
          exitCode: 0,
          stdout: `Adding yarn@1.22.4 to the cache...\n`,
          stderr: ``,
        });
        process.env.COREPACK_ENABLE_NETWORK = `0`;
      }

      await expect(runCli(cwd, [`install`, `-g`, `--cache-only`, `yarn@1.0.0`])).resolves.toEqual({
        exitCode: 0,
        stdout: `Adding yarn@1.0.0 to the cache...\n`,
        stderr: ``,
      });
      await expect(xfs.readJsonPromise(ppath.join(npath.toPortablePath(process.env.COREPACK_HOME!), `lastKnownGood.json`))).resolves.toEqual({
        yarn: `1.0.0`,
      });
    });
  });
});
