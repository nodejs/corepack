import type {Filename}                    from '@yarnpkg/fslib';
import {ppath, xfs, npath}                from '@yarnpkg/fslib';
import process                            from 'node:process';
import {describe, beforeEach, it, expect} from 'vitest';

import {runCli}                           from './_runCli.ts';

beforeEach(async () => {
  const home = await xfs.mktempPromise();
  process.env.COREPACK_HOME = npath.fromPortablePath(home);
  process.env.COREPACK_ENABLE_NETWORK = `0`;
  return async () => {
    await xfs.removePromise(home, {recursive: true});
  };
});

function getHome() {
  return npath.toPortablePath(process.env.COREPACK_HOME!);
}

async function cacheVersion(name: string, reference: string) {
  const folder = ppath.join(getHome(), `v1`, name as Filename, reference.split(`+`)[0] as Filename);
  await xfs.mkdirpPromise(folder);
  await xfs.writeJsonPromise(ppath.join(folder, `.corepack`), {
    locator: {name, reference},
    bin: {[name]: `bin.js`},
    hash: `sha512.deadbeef`,
  });
  return folder;
}

describe(`ListCommand`, () => {
  it.each([
    [`list`, `-g`],
    [`ls`, `--global`],
    [`-g`, `ls`],
  ])(`supports %j`, async (...args) => {
    await cacheVersion(`pnpm`, `9.10.0`);
    await cacheVersion(`pnpm`, `9.9.0`);
    await cacheVersion(`npm`, `10.0.0`);
    await cacheVersion(`yarn`, `4.0.0-rc.1`);
    await cacheVersion(`yarn`, `4.0.0`);
    await xfs.writeJsonPromise(ppath.join(getHome(), `lastKnownGood.json`), {
      pnpm: `9.9.0+sha512.deadbeef`,
    });

    await expect(runCli(getHome(), args)).resolves.toEqual({
      exitCode: 0,
      stdout: `npm@10.0.0\npnpm@9.10.0\npnpm@9.9.0 (default)\nyarn@4.0.0\nyarn@4.0.0-rc.1\n`,
      stderr: ``,
    });
  });

  it(`lists installed versions as JSON without modifying defaults or the project`, async () => {
    await cacheVersion(`pnpm`, `9.10.0+sha512.deadbeef`);
    const defaults = {pnpm: `9.10.0`, yarn: `4.0.0`};
    const manifest = {packageManager: `yarn@3.0.0`};
    await xfs.writeJsonPromise(ppath.join(getHome(), `lastKnownGood.json`), defaults);
    await xfs.writeJsonPromise(ppath.join(getHome(), `package.json`), manifest);

    const result = await runCli(getHome(), [`list`, `-g`, `--json`]);
    expect(result).toMatchObject({exitCode: 0, stderr: ``});
    expect(JSON.parse(result.stdout)).toEqual([{name: `pnpm`, version: `9.10.0`, isDefault: true}]);
    await expect(xfs.readJsonPromise(ppath.join(getHome(), `lastKnownGood.json`))).resolves.toEqual(defaults);
    await expect(xfs.readJsonPromise(ppath.join(getHome(), `package.json`))).resolves.toEqual(manifest);
  });

  it(`does not create a missing cache`, async () => {
    const cwd = getHome();
    process.env.COREPACK_HOME = npath.fromPortablePath(ppath.join(cwd, `missing`));
    await expect(runCli(cwd, [`list`, `-g`, `--json`])).resolves.toEqual({
      exitCode: 0, stdout: `[]\n`, stderr: ``,
    });
    await expect(xfs.existsPromise(getHome())).resolves.toBe(false);
  });

  it(`loads COREPACK_HOME from the closest environment file`, async () => {
    await cacheVersion(`pnpm`, `9.0.0`);
    const cwd = getHome();
    await xfs.writeFilePromise(ppath.join(cwd, `.corepack.env`), `COREPACK_HOME=${JSON.stringify(process.env.COREPACK_HOME)}\n`);
    delete process.env.COREPACK_HOME;
    await expect(runCli(cwd, [`list`, `-g`])).resolves.toEqual({
      exitCode: 0, stdout: `pnpm@9.0.0\n`, stderr: ``,
    });
  });

  it(`explains an empty cache`, async () => {
    await expect(runCli(getHome(), [`list`, `-g`])).resolves.toEqual({
      exitCode: 0,
      stdout: `No package managers are installed in the Corepack cache.\n`,
      stderr: ``,
    });
  });

  it(`ignores temporary, incomplete, and invalid cache entries`, async () => {
    await cacheVersion(`pnpm`, `9.0.0`);
    const folder = ppath.join(getHome(), `v1`, `pnpm`);
    await xfs.mkdirPromise(ppath.join(folder, `10.0.0`));
    await xfs.mkdirPromise(ppath.join(folder, `.DS_Store`));
    await xfs.writeFilePromise(ppath.join(folder, `11.0.0`), ``);
    for (const [version, content] of [
      [`12.0.0`, `{`],
      [`13.0.0`, `null`],
      [`14.0.0`, JSON.stringify({locator: {name: `yarn`, reference: `14.0.0`}})],
      [`15.0.0`, JSON.stringify({locator: {name: `pnpm`, reference: `16.0.0`}})],
    ]) {
      const entry = await cacheVersion(`pnpm`, version);
      await xfs.writeFilePromise(ppath.join(entry, `.corepack`), content);
    }
    await expect(runCli(getHome(), [`list`, `-g`])).resolves.toEqual({
      exitCode: 0, stdout: `pnpm@9.0.0\n`, stderr: ``,
    });
  });

  it(`tolerates invalid Last Known Good data`, async () => {
    await cacheVersion(`pnpm`, `9.0.0`);
    await xfs.writeFilePromise(ppath.join(getHome(), `lastKnownGood.json`), `{`);
    await expect(runCli(getHome(), [`list`, `-g`])).resolves.toEqual({
      exitCode: 0, stdout: `pnpm@9.0.0\n`, stderr: ``,
    });
  });

  it(`lists versions installed by Corepack and updates after cache clean`, async () => {
    delete process.env.COREPACK_ENABLE_NETWORK;
    process.env.COREPACK_DEFAULT_TO_LATEST = `0`;
    await expect(runCli(getHome(), [`install`, `-g`, `yarn@1.22.4`])).resolves.toMatchObject({exitCode: 0});
    process.env.COREPACK_ENABLE_NETWORK = `0`;
    await expect(runCli(getHome(), [`ls`, `-g`])).resolves.toEqual({
      exitCode: 0, stdout: `yarn@1.22.4 (default)\n`, stderr: ``,
    });
    await expect(runCli(getHome(), [`cache`, `clean`])).resolves.toMatchObject({exitCode: 0});
    await expect(runCli(getHome(), [`ls`, `-g`, `--json`])).resolves.toEqual({
      exitCode: 0, stdout: `[]\n`, stderr: ``,
    });
  });
});
