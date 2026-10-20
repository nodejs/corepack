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

describe(`InstallLocalCommand`, () => {
  it.each([
    [`1.22.4`, `1.22.4+sha512.a1833b862fe52169bd6c2a033045a07df5bc6a23595c259e675fed1b2d035ab37abe6ce309720abb6636d68f03615054b6292dc0a70da31c8697fda228b50d18`],
    [`1.22.4+sha224.0d6eecaf4d82ec12566fdd97143794d0f0c317e0d652bd4d1b305430`, `1.22.4+sha224.0d6eecaf4d82ec12566fdd97143794d0f0c317e0d652bd4d1b305430`],
  ])(`should report the cached version and integrity hash on repeated installs (%s)`, async (version, cachedReference) => {
    await xfs.mktempPromise(async cwd => {
      const manifestPath = ppath.join(cwd, `package.json`);
      await xfs.writeJsonPromise(manifestPath, {packageManager: `yarn@${version}`});
      const manifest = await xfs.readFilePromise(manifestPath, `utf8`);

      await expect(runCli(cwd, [`install`])).resolves.toEqual({
        exitCode: 0,
        stdout: `Adding yarn@${version} to the cache...\n`,
        stderr: ``,
      });

      process.env.COREPACK_ENABLE_NETWORK = `0`;
      await expect(runCli(cwd, [`install`])).resolves.toEqual({
        exitCode: 0,
        stdout: `yarn@${cachedReference} is already in the cache\n`,
        stderr: ``,
      });
      await expect(xfs.readFilePromise(manifestPath, `utf8`)).resolves.toBe(manifest);
      expect(await xfs.existsPromise(ppath.join(npath.toPortablePath(process.env.COREPACK_HOME!), `lastKnownGood.json`))).toBe(false);
      await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toEqual({
        exitCode: 0,
        stdout: `1.22.4\n`,
        stderr: ``,
      });
    });
  });

  it(`should include the stored hash when an exact devEngines version is already cached`, async () => {
    await xfs.mktempPromise(async cwd => {
      const version = `1.22.4+sha224.0d6eecaf4d82ec12566fdd97143794d0f0c317e0d652bd4d1b305430`;
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
        devEngines: {packageManager: {name: `yarn`, version}},
      });

      await expect(runCli(cwd, [`install`])).resolves.toEqual({
        exitCode: 0,
        stdout: `Adding yarn@${version} to the cache...\n`,
        stderr: ``,
      });
      process.env.COREPACK_ENABLE_NETWORK = `0`;
      await expect(runCli(cwd, [`install`])).resolves.toEqual({
        exitCode: 0,
        stdout: `yarn@${version} is already in the cache\n`,
        stderr: ``,
      });
    });
  });

  it(`should report cache reuse after resolving a devEngines range offline`, async () => {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {packageManager: `yarn@1.22.4`});
      await expect(runCli(cwd, [`install`])).resolves.toEqual({
        exitCode: 0,
        stdout: `Adding yarn@1.22.4 to the cache...\n`,
        stderr: ``,
      });
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
        devEngines: {packageManager: {name: `yarn`, version: `^1.0.0`}},
      });
      process.env.COREPACK_ENABLE_NETWORK = `0`;

      await expect(runCli(cwd, [`install`])).resolves.toEqual({
        exitCode: 0,
        stdout: `yarn@1.22.4+sha512.a1833b862fe52169bd6c2a033045a07df5bc6a23595c259e675fed1b2d035ab37abe6ce309720abb6636d68f03615054b6292dc0a70da31c8697fda228b50d18 is already in the cache\n`,
        stderr: ``,
      });
    });
  });

  it(`should report installation again after clearing the cache`, async () => {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {packageManager: `yarn@1.22.4`});
      const expected = {exitCode: 0, stdout: `Adding yarn@1.22.4 to the cache...\n`, stderr: ``};

      await expect(runCli(cwd, [`install`])).resolves.toEqual(expected);
      await expect(runCli(cwd, [`cache`, `clean`])).resolves.toEqual({exitCode: 0, stdout: ``, stderr: ``});
      await expect(runCli(cwd, [`install`])).resolves.toEqual(expected);
    });
  });

  it(`should not report a cached version when the download fails integrity verification`, async () => {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {packageManager: `yarn@1.22.4+sha1.deadbeef`});

      // Repeat the failed install to verify that the invalid download was not cached.
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await runCli(cwd, [`install`]);
        expect(result).toEqual({
          exitCode: 1,
          stdout: expect.stringContaining(`Internal Error: Mismatch hashes. Expected deadbeef, got`),
          stderr: ``,
        });
        expect(result.stdout).not.toContain(`is already in the cache`);
        expect(result.stdout).not.toContain(`Adding yarn@`);
      }
    });
  });
});
