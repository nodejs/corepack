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

describe(`use --here`, () => {
  it.each([true, false])(`targets the current directory (manifest exists: %s)`, async exists => {
    await xfs.mktempPromise(async root => {
      const parent = `{"packageManager":"yarn@1.22.4"}\n`;
      await xfs.writeFilePromise(ppath.join(root, `package.json`), parent);
      const cwd = ppath.join(root, `examples`, `pnpm`);
      await xfs.mkdirpPromise(cwd);
      if (exists)
        await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {name: `example`});

      await expect(runCli(cwd, [`use`, `pnpm@1.9998.9999`, `--here`], true)).resolves.toMatchObject({
        exitCode: 0,
        stdout: expect.stringContaining(`pnpm: Hello from custom registry`),
        stderr: ``,
      });
      await expect(xfs.readFilePromise(ppath.join(root, `package.json`), `utf8`)).resolves.toBe(parent);
      await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toMatchObject({
        ...(exists ? {name: `example`} : {}),
        packageManager: expect.stringMatching(/^pnpm@1\.9998\.9999\+sha512\.[0-9a-f]{128}$/),
      });
    });
  });

  it.each([
    `{"devEngines":{"packageManager":{"name":"yarn","version":"2.x"}}}`,
    `{invalid JSON`,
  ])(`ignores parent manifest %s`, async parent => {
    await xfs.mktempPromise(async root => {
      await xfs.writeFilePromise(ppath.join(root, `package.json`), parent);
      const cwd = ppath.join(root, `child`);
      await xfs.mkdirPromise(cwd);
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {});
      await expect(runCli(cwd, [`use`, `--here`, `pnpm@1.9998.9999`], true)).resolves.toMatchObject({exitCode: 0});
      await expect(xfs.readFilePromise(ppath.join(root, `package.json`), `utf8`)).resolves.toBe(parent);
    });
  });

  it.each([{flags: []}, {flags: [`--no-here`]}])(`retains normal parent lookup with $flags`, async ({flags}) => {
    await xfs.mktempPromise(async root => {
      await xfs.writeJsonPromise(ppath.join(root, `package.json`), {packageManager: `yarn@1.22.4`});
      const cwd = ppath.join(root, `child`);
      await xfs.mkdirPromise(cwd);
      const child = `{ "name": "child" }\n`;
      await xfs.writeFilePromise(ppath.join(cwd, `package.json`), child);
      await expect(runCli(cwd, [`use`, ...flags, `pnpm@1.9998.9999`], true)).resolves.toMatchObject({exitCode: 0});
      await expect(xfs.readFilePromise(ppath.join(cwd, `package.json`), `utf8`)).resolves.toBe(child);
      await expect(xfs.readJsonPromise(ppath.join(root, `package.json`))).resolves.toMatchObject({
        packageManager: expect.stringMatching(/^pnpm@1\.9998\.9999\+/),
      });
    });
  });

  it(`validates the current manifest's devEngines constraints`, async () => {
    await xfs.mktempPromise(async root => {
      await xfs.writeJsonPromise(ppath.join(root, `package.json`), {packageManager: `pnpm@1.0.0`});
      const cwd = ppath.join(root, `child`);
      await xfs.mkdirPromise(cwd);
      const child = `{"devEngines":{"packageManager":{"name":"yarn","version":"2.x"}}}`;
      await xfs.writeFilePromise(ppath.join(cwd, `package.json`), child);
      await expect(runCli(cwd, [`use`, `--here`, `pnpm@1.9998.9999`], true)).resolves.toMatchObject({
        exitCode: 1,
        stdout: expect.stringContaining(`does not match the devEngines specification (yarn@2.x)`),
      });
      await expect(xfs.readFilePromise(ppath.join(cwd, `package.json`), `utf8`)).resolves.toBe(child);
    });
  });

  it.each([true, false])(`loads environment only from the current directory (local: %s)`, async local => {
    await xfs.mktempPromise(async root => {
      const cwd = ppath.join(root, `child`);
      await xfs.mkdirPromise(cwd);
      await xfs.writeFilePromise(ppath.join(local ? cwd : root, `.corepack.env`), `COREPACK_ENABLE_NETWORK=0\n`);
      const result = await runCli(cwd, [`use`, `--here`, `pnpm@1.9998.9999`], true);
      expect(result.exitCode).toBe(local ? 1 : 0);
      if (local) {
        expect(result.stdout).toContain(`Network access disabled`);
        await expect(xfs.existsPromise(ppath.join(cwd, `package.json`))).resolves.toBe(false);
      }
    });
  });

  it(`runs the installation in the current directory`, async () => {
    await xfs.mktempPromise(async root => {
      const parent = `{"packageManager":"pnpm@1.0.0"}\n`;
      await xfs.writeFilePromise(ppath.join(root, `package.json`), parent);
      const cwd = ppath.join(root, `child`);
      await xfs.mkdirPromise(cwd);
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
        name: `child`,
        license: `MIT`,
        scripts: {postinstall: `node -e "require('fs').writeFileSync('installed-here', process.cwd())"`},
      });
      await expect(runCli(cwd, [`use`, `--here`, `yarn@1.22.4`])).resolves.toMatchObject({exitCode: 0});
      await expect(xfs.readFilePromise(ppath.join(cwd, `installed-here`), `utf8`)).resolves.toBe(npath.fromPortablePath(cwd));
      await expect(xfs.existsPromise(ppath.join(root, `installed-here`))).resolves.toBe(false);
      await expect(xfs.readFilePromise(ppath.join(root, `package.json`), `utf8`)).resolves.toBe(parent);
    });
  });
});
