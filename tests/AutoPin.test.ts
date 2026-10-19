import type {Filename}                    from '@yarnpkg/fslib';
import {npath, ppath, xfs}                from '@yarnpkg/fslib';
import {beforeEach, describe, expect, it} from 'vitest';

import {runCli}                           from './_runCli.ts';

const manifest = `{\n  "private": true\n}\n`;

beforeEach(async () => {
  const home = await xfs.mktempPromise();
  process.env.COREPACK_HOME = npath.fromPortablePath(home);
  process.env.COREPACK_DEFAULT_TO_LATEST = `0`;
  process.env.COREPACK_ENABLE_AUTO_PIN = `1`;
  process.env.AUTH_TYPE = `COREPACK_NPM_TOKEN`;
  process.env.TEST_INTEGRITY = `valid`;

  return async () => {
    await xfs.removePromise(home, {recursive: true});
  };
});

describe.each([`yarn`, `pnpm`])(`auto-pinning %s`, name => {
  it.each([
    {lockfile: `package-lock.json`, manager: `npm`},
    {lockfile: `npm-shrinkwrap.json`, manager: `npm`},
    {lockfile: `pnpm-lock.yaml`, manager: `pnpm`},
    {lockfile: `yarn.lock`, manager: `yarn`},
  ])(`respects $lockfile`, async ({lockfile, manager}) => {
    await xfs.mktempPromise(async cwd => {
      const manifestPath = ppath.join(cwd, `package.json`);
      const lockfilePath = ppath.join(cwd, lockfile as Filename);
      await xfs.writeFilePromise(manifestPath, manifest);
      await xfs.writeFilePromise(lockfilePath, `existing lockfile\n`);

      await expect(runCli(cwd, [`${name}@1.9998.9999`, `--version`], true)).resolves.toMatchObject({
        exitCode: 0,
        stdout: `${name}: Hello from custom registry\n`,
        stderr: manager === name ? expect.stringContaining(`Corepack will now add one referencing ${name}@`) : ``,
      });

      if (manager === name) {
        await expect(xfs.readJsonPromise(manifestPath)).resolves.toMatchObject({
          packageManager: expect.stringMatching(new RegExp(`^${name}@1\\.9998\\.9999\\+sha512\\.`)),
        });
      } else {
        await expect(xfs.readFilePromise(manifestPath, `utf8`)).resolves.toBe(manifest);
      }
      await expect(xfs.readFilePromise(lockfilePath, `utf8`)).resolves.toBe(`existing lockfile\n`);
    });
  });
});

it(`checks lockfiles alongside the selected manifest when invoked from a subdirectory`, async () => {
  await xfs.mktempPromise(async cwd => {
    const manifestPath = ppath.join(cwd, `package.json`);
    const subdirectory = ppath.join(cwd, `src`);
    await xfs.mkdirPromise(subdirectory);
    await xfs.writeFilePromise(manifestPath, manifest);
    await xfs.writeFilePromise(ppath.join(cwd, `package-lock.json`), `{}`);

    await expect(runCli(subdirectory, [`pnpm@1.9998.9999`, `--version`], true)).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
      stdout: `pnpm: Hello from custom registry\n`,
    });
    await expect(xfs.readFilePromise(manifestPath, `utf8`)).resolves.toBe(manifest);
  });
});

it(`skips auto-pinning if both matching and conflicting lockfiles exist`, async () => {
  await xfs.mktempPromise(async cwd => {
    const manifestPath = ppath.join(cwd, `package.json`);
    await xfs.writeFilePromise(manifestPath, manifest);
    await xfs.writeFilePromise(ppath.join(cwd, `pnpm-lock.yaml`), ``);
    await xfs.writeFilePromise(ppath.join(cwd, `yarn.lock`), ``);

    await expect(runCli(cwd, [`pnpm@1.9998.9999`, `--version`], true)).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
    });
    await expect(xfs.readFilePromise(manifestPath, `utf8`)).resolves.toBe(manifest);
  });
});

it(`allows explicitly selecting another package manager with corepack use`, async () => {
  await xfs.mktempPromise(async cwd => {
    const manifestPath = ppath.join(cwd, `package.json`);
    await xfs.writeFilePromise(manifestPath, manifest);
    await xfs.writeFilePromise(ppath.join(cwd, `package-lock.json`), `{}`);

    await expect(runCli(cwd, [`use`, `pnpm@1.9998.9999`], true)).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
    });
    await expect(xfs.readJsonPromise(manifestPath)).resolves.toMatchObject({
      packageManager: expect.stringMatching(/^pnpm@1\.9998\.9999\+sha512\./),
    });
  });
});

it.each([`package-lock.json`, `yarn.lock`])(`respects %s when auto-pinning npm`, async lockfile => {
  await xfs.mktempPromise(async cwd => {
    const manifestPath = ppath.join(cwd, `package.json`);
    await xfs.writeFilePromise(manifestPath, manifest);
    await xfs.writeFilePromise(ppath.join(cwd, lockfile as Filename), ``);

    await expect(runCli(cwd, [`npm@6.14.2`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stdout: `6.14.2\n`,
      stderr: lockfile === `package-lock.json` ? expect.stringContaining(`Corepack will now add one referencing npm@`) : ``,
    });
    if (lockfile === `package-lock.json`) {
      await expect(xfs.readJsonPromise(manifestPath)).resolves.toMatchObject({
        packageManager: expect.stringMatching(/^npm@6\.14\.2\+sha512\./),
      });
    } else {
      await expect(xfs.readFilePromise(manifestPath, `utf8`)).resolves.toBe(manifest);
    }
  });
});
