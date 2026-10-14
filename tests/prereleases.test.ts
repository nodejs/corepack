import {ppath, xfs, npath}                from '@yarnpkg/fslib';
import process                            from 'node:process';
import {beforeEach, describe, expect, it} from 'vitest';

import {runCli}                           from './_runCli.ts';

beforeEach(async () => {
  const home = await xfs.mktempPromise();
  process.env.COREPACK_HOME = npath.fromPortablePath(home);
  process.env.COREPACK_DEFAULT_TO_LATEST = `0`;
  process.env.AUTH_TYPE = `COREPACK_NPM_TOKEN`;
  process.env.TEST_INTEGRITY = `valid`;
  process.env.TEST_PRERELEASES = `1`;

  return async () => {
    await xfs.removePromise(home, {recursive: true});
  };
});

describe(`prerelease resolution`, () => {
  it.each([`pnpm`, `pnpm@1`])(`should select a stable version for use %s`, async pattern => {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {});

      await expect(runCli(cwd, [`use`, pattern], true)).resolves.toMatchObject({
        exitCode: 0,
        stdout: `Installing pnpm@1.9998.9999 in the project...\n\npnpm: Hello from custom registry\n`,
        stderr: ``,
      });
      await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toMatchObject({
        packageManager: expect.stringMatching(/^pnpm@1\.9998\.9999\+sha512\.[0-9a-f]{128}$/),
      });
    });
  });

  it(`should install a stable global default`, async () => {
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`install`, `-g`, `pnpm`], true)).resolves.toMatchObject({
        exitCode: 0,
        stdout: `Installing pnpm@1.9998.9999...\n`,
        stderr: ``,
      });
      const home = npath.toPortablePath(process.env.COREPACK_HOME!);
      await expect(xfs.readJsonPromise(ppath.join(home, `lastKnownGood.json`))).resolves.toEqual({
        pnpm: `1.9998.9999`,
      });
    });
  });

  it(`should keep upgrades from a stable version on stable releases`, async () => {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
        packageManager: `pnpm@1.0.0`,
      });

      await expect(runCli(cwd, [`up`], true)).resolves.toMatchObject({
        exitCode: 0,
        stdout: `Installing pnpm@1.9998.9999 in the project...\n\npnpm: Hello from custom registry\n`,
        stderr: ``,
      });
      await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toMatchObject({
        packageManager: expect.stringMatching(/^pnpm@1\.9998\.9999\+sha512\.[0-9a-f]{128}$/),
      });
    });
  });

  it.each([
    {current: `2.0.0-rc.0`, version: `2.0.0-rc.1`},
    {current: `1.9999.0-beta.0`, version: `1.9999.0-beta.1`},
    {current: `1.9998.9999-beta.0`, version: `1.9998.9999`},
  ])(`should upgrade an explicitly selected prerelease from $current to $version`, async ({current, version}) => {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
        packageManager: `pnpm@${current}`,
      });

      await expect(runCli(cwd, [`up`], true)).resolves.toMatchObject({
        exitCode: 0,
        stdout: `Installing pnpm@${version} in the project...\n\npnpm: Hello from custom registry\n`,
        stderr: ``,
      });
      const manifest = await xfs.readJsonPromise(ppath.join(cwd, `package.json`));
      expect(manifest.packageManager.split(`+`, 1)[0]).toBe(`pnpm@${version}`);
    });
  });

  it(`should not downgrade an explicitly selected prerelease`, async () => {
    await xfs.mktempPromise(async cwd => {
      const manifest = {packageManager: `pnpm@1.9999.0-beta.2`};
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), manifest);

      await expect(runCli(cwd, [`up`], true)).resolves.toMatchObject({
        exitCode: 1,
        stdout: expect.stringContaining(`Failed to find the highest release for pnpm 1.x`),
        stderr: ``,
      });
      await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toEqual(manifest);
    });
  });

  it.each([
    {range: `2.0.0-rc.1`, version: `2.0.0-rc.1`},
    {range: `^2.0.0-rc.0`, version: `2.0.0-rc.1`},
    {range: `1.9999.0-beta.0 - 1.9999.0-beta.9`, version: `1.9999.0-beta.1`},
    {range: `next`, version: `2.0.0-rc.1`},
  ])(`should allow explicitly requested prereleases with $range`, async ({range, version}) => {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {});

      await expect(runCli(cwd, [`use`, `pnpm@${range}`], true)).resolves.toMatchObject({
        exitCode: 0,
        stdout: `Installing pnpm@${version} in the project...\n\npnpm: Hello from custom registry\n`,
        stderr: ``,
      });
      const manifest = await xfs.readJsonPromise(ppath.join(cwd, `package.json`));
      expect(manifest.packageManager.split(`+`, 1)[0]).toBe(`pnpm@${version}`);
    });
  });

  it.each([`^2`, `^2.0.0-rc.2`])(`should not use a prerelease outside %s`, async range => {
    await xfs.mktempPromise(async cwd => {
      const manifest = {packageManager: `pnpm@1.0.0`};
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), manifest);

      await expect(runCli(cwd, [`use`, `pnpm@${range}`], true)).resolves.toMatchObject({
        exitCode: 1,
        stdout: expect.stringContaining(`Failed to successfully resolve '${range}' to a valid pnpm release`),
        stderr: ``,
      });
      await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toEqual(manifest);
    });
  });
});
