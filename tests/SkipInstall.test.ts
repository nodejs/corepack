import {npath, ppath, xfs}                from '@yarnpkg/fslib';
import {beforeEach, describe, expect, it} from 'vitest';

import {runCli}                           from './_runCli.ts';

beforeEach(async () => {
  const home = await xfs.mktempPromise();
  process.env.COREPACK_HOME = npath.fromPortablePath(home);
  process.env.COREPACK_DEFAULT_TO_LATEST = `0`;
  process.env.AUTH_TYPE = `COREPACK_NPM_TOKEN`;
  process.env.TEST_INTEGRITY = `valid`;

  return async () => {
    await xfs.removePromise(home, {recursive: true});
  };
});

describe.each([`use`, `up`])(`%s --skip-install`, command => {
  const args = command === `use` ? [`use`, `pnpm@latest`] : [`up`];

  it.each([undefined, `--skip-install`, `--no-skip-install`])(`updates the manifest with option %j`, async option => {
    const options = option ? [option] : [];
    await xfs.mktempPromise(async cwd => {
      const manifestPath = ppath.join(cwd, `package.json`);
      await xfs.writeJsonPromise(manifestPath, {packageManager: `pnpm@1.0.0`});

      await expect(runCli(cwd, [...args, ...options], true)).resolves.toEqual({
        exitCode: 0,
        stdout: `Installing pnpm@1.9998.9999 in the project...\n${options.includes(`--skip-install`) ? `` : `\npnpm: Hello from custom registry\n`}`,
        stderr: ``,
      });
      await expect(xfs.readJsonPromise(manifestPath)).resolves.toMatchObject({
        packageManager: expect.stringMatching(/^pnpm@1\.9998\.9999\+sha512\./),
      });

      // The package manager itself is installed even when dependencies aren't.
      process.env.COREPACK_ENABLE_NETWORK = `0`;
      await expect(runCli(cwd, [`pnpm`, `--version`], true)).resolves.toEqual({
        exitCode: 0,
        stdout: `pnpm: Hello from custom registry\n`,
        stderr: ``,
      });
    });
  });

  it(`still verifies downloads before updating the manifest`, async () => {
    process.env.TEST_INTEGRITY = `invalid_signature`;
    await xfs.mktempPromise(async cwd => {
      const manifestPath = ppath.join(cwd, `package.json`);
      const manifest = {packageManager: `pnpm@1.0.0`};
      await xfs.writeJsonPromise(manifestPath, manifest);

      await expect(runCli(cwd, [...args, `--skip-install`], true)).resolves.toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining(`Signature does not match`),
      });
      await expect(xfs.readJsonPromise(manifestPath)).resolves.toEqual(manifest);
    });
  });
});

it(`use --skip-install still enforces devEngines constraints`, async () => {
  await xfs.mktempPromise(async cwd => {
    const manifestPath = ppath.join(cwd, `package.json`);
    const manifest = {devEngines: {packageManager: {name: `pnpm`, version: `2.x`}}};
    await xfs.writeJsonPromise(manifestPath, manifest);

    await expect(runCli(cwd, [`use`, `pnpm@latest`, `--skip-install`], true)).resolves.toMatchObject({
      exitCode: 1,
      stdout: expect.stringContaining(`does not match the devEngines specification (pnpm@2.x)`),
    });
    await expect(xfs.readJsonPromise(manifestPath)).resolves.toEqual(manifest);
  });
});
