import {npath, ppath, xfs}                from '@yarnpkg/fslib';
import {beforeEach, describe, expect, it} from 'vitest';

import {runCli}                           from './_runCli.ts';

describe(`COREPACK_MINIMUM_RELEASE_AGE`, () => {
  beforeEach(async () => {
    const home = await xfs.mktempPromise();
    process.env.COREPACK_HOME = npath.fromPortablePath(home);
    process.env.COREPACK_DEFAULT_TO_LATEST = `0`;
    process.env.COREPACK_MINIMUM_RELEASE_AGE = `60`;
    process.env.AUTH_TYPE = `COREPACK_NPM_TOKEN`;
    process.env.TEST_INTEGRITY = `valid`;

    return async () => {
      await xfs.removePromise(home, {recursive: true});
    };
  });

  it.each([`latest`, `^1.0.0`])(`installs the highest eligible version for pnpm@%s`, async range => {
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`install`, `-g`, `pnpm@${range}`], true)).resolves.toEqual({
        exitCode: 0,
        stdout: `Installing pnpm@1.9998.9998...\n`,
        stderr: ``,
      });
      await expect(xfs.readJsonPromise(ppath.join(npath.toPortablePath(process.env.COREPACK_HOME!), `lastKnownGood.json`))).resolves.toEqual({pnpm: `1.9998.9998`});
    });
  });

  it.each([`latest`, `^1.0.0`, `>=1.9998.9999`])(`fails cleanly when no version qualifies for pnpm@%s`, async range => {
    process.env.COREPACK_MINIMUM_RELEASE_AGE = `4320`;
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`install`, `-g`, `pnpm@${range}`], true)).resolves.toEqual({
        exitCode: 1,
        stdout: expect.stringContaining(`Usage Error: No pnpm release older than 4320 minutes is available`),
        stderr: ``,
      });
    });
  });

  it(`fails when only releases outside the requested range are old enough`, async () => {
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`install`, `-g`, `pnpm@>=1.9998.9999`], true)).resolves.toEqual({
        exitCode: 1,
        stdout: expect.stringContaining(`No pnpm release older than 60 minutes is available for range >=1.9998.9999`),
        stderr: ``,
      });
    });
  });

  it(`allows an explicitly pinned new release`, async () => {
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`install`, `-g`, `pnpm@1.9998.9999`], true)).resolves.toEqual({
        exitCode: 0,
        stdout: `Installing pnpm@1.9998.9999...\n`,
        stderr: ``,
      });
    });
  });

  it.each([undefined, ``, `0`])(`keeps current latest behavior when set to %j`, async value => {
    if (value === undefined)
      delete process.env.COREPACK_MINIMUM_RELEASE_AGE;
    else
      process.env.COREPACK_MINIMUM_RELEASE_AGE = value;

    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`install`, `-g`, `pnpm@latest`], true)).resolves.toEqual({
        exitCode: 0,
        stdout: `Installing pnpm@1.9998.9999...\n`,
        stderr: ``,
      });
    });
  });

  it(`validates the setting before accessing the network`, async () => {
    process.env.COREPACK_MINIMUM_RELEASE_AGE = `one day`;
    process.env.COREPACK_ENABLE_NETWORK = `0`;
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`install`, `-g`, `pnpm@latest`], true)).resolves.toEqual({
        exitCode: 1,
        stdout: expect.stringContaining(`Usage Error: COREPACK_MINIMUM_RELEASE_AGE must be a non-negative integer number of minutes`),
        stderr: ``,
      });
    });
  });

  it(`applies the gate to the implicit latest lookup and verifies the selected release`, async () => {
    process.env.COREPACK_DEFAULT_TO_LATEST = `1`;
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`pnpm`, `--version`], true)).resolves.toEqual({
        exitCode: 0,
        stdout: `pnpm: Hello from custom registry\n`,
        stderr: ``,
      });
      await expect(xfs.readJsonPromise(ppath.join(npath.toPortablePath(process.env.COREPACK_HOME!), `lastKnownGood.json`))).resolves.toEqual({pnpm: expect.stringMatching(/^1\.9998\.9998\+sha512\./)});
    });
  });

  it(`does not let a cached new release bypass range resolution`, async () => {
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`install`, `-g`, `pnpm@1.9998.9999`], true)).resolves.toMatchObject({exitCode: 0});
      await expect(runCli(cwd, [`prepare`, `pnpm@^1.0.0`, `--activate`], true)).resolves.toEqual({
        exitCode: 0,
        stdout: `Preparing pnpm@^1.0.0 for immediate activation...\n`,
        stderr: ``,
      });
      await expect(xfs.readJsonPromise(ppath.join(npath.toPortablePath(process.env.COREPACK_HOME!), `lastKnownGood.json`))).resolves.toEqual({pnpm: `1.9998.9998`});
    });
  });

  it.each([`use`, `up`])(`applies the gate to corepack %s`, async command => {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {packageManager: `pnpm@1.9998.9997`});
      await expect(runCli(cwd, command === `use` ? [`use`, `pnpm@latest`] : [`up`], true)).resolves.toEqual({
        exitCode: 0,
        stdout: `Installing pnpm@1.9998.9998 in the project...\n\npnpm: Hello from custom registry\n`,
        stderr: ``,
      });
      await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toMatchObject({packageManager: expect.stringMatching(/^pnpm@1\.9998\.9998\+sha512\./)});
    });
  });
});
