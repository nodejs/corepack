import {npath, ppath, xfs}                from '@yarnpkg/fslib';
import type {PortablePath}                from '@yarnpkg/fslib';
import {beforeEach, describe, expect, it} from 'vitest';

import {runCli}                           from './_runCli.ts';

beforeEach(async () => {
  const home = await xfs.mktempPromise();
  process.env.COREPACK_HOME = npath.fromPortablePath(home);
  process.env.COREPACK_DEFAULT_TO_LATEST = `0`;
  process.env.COREPACK_ENABLE_NETWORK = `0`;
  return () => xfs.removePromise(home, {recursive: true});
});

async function cachePackageManager(cwd: PortablePath) {
  await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {packageManager: `pnpm@1.0.0`});
  const folder = ppath.join(npath.toPortablePath(process.env.COREPACK_HOME!), `v1`, `pnpm`, `1.0.0`);
  await xfs.mkdirpPromise(folder);
  await xfs.writeJsonPromise(ppath.join(folder, `.corepack`), {
    locator: {name: `pnpm`, reference: `1.0.0`},
    bin: {pnpm: `pnpm.js`},
    hash: `sha512.abc`,
  });
  await xfs.writeFilePromise(ppath.join(folder, `pnpm.js`), `console.log(JSON.stringify(process.argv.slice(2))); if (process.argv.includes('--fail')) process.exitCode = 23;\n`);
}

describe(`verbose diagnostics`, () => {
  it(`keeps the global command help available`, async () => {
    await xfs.mktempPromise(async cwd => {
      const result = await runCli(cwd, [`--help`]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`corepack cache clean`);
      expect(result.stdout).toContain(`corepack use`);
      expect(result.stderr).toBe(``);
    });
  });

  it(`supports the version command`, async () => {
    await xfs.mktempPromise(async cwd => {
      const plain = await runCli(cwd, [`--version`]);
      const verbose = await runCli(cwd, [`--verbose`, `--version`]);
      expect(verbose.exitCode).toBe(0);
      expect(verbose.stdout).toBe(plain.stdout);
    });
  });

  it.each([
    {command: [`cache`, `clean`], verbose: false},
    {command: [`cache`, `clear`, `--no-verbose`], verbose: false},
    {command: [`cache`, `clean`, `--verbose`], verbose: true},
    {command: [`--verbose`, `cache`, `clear`], verbose: true},
  ])(`cleans the cache with $command`, async ({command, verbose}) => {
    await xfs.mktempPromise(async cwd => {
      const folder = ppath.join(npath.toPortablePath(process.env.COREPACK_HOME!), `v1`);
      await xfs.mkdirpPromise(folder);
      await xfs.writeFilePromise(ppath.join(folder, `cached-file`), `cached`);

      const result = await runCli(cwd, command);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(``);
      if (verbose) {
        expect(result.stderr).toContain(`Removing package manager cache at ${npath.fromPortablePath(folder)}`);
        expect(result.stderr).toContain(`Finished cleaning package manager cache`);
      } else {
        expect(result.stderr).toBe(``);
      }
      await expect(xfs.existsPromise(folder)).resolves.toBe(false);
    });
  });

  it(`reports when the cache is already absent`, async () => {
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`cache`, `clean`, `--verbose`])).resolves.toMatchObject({
        exitCode: 0,
        stdout: ``,
        stderr: expect.stringContaining(`Package manager cache does not exist at`),
      });
    });
  });

  it(`preserves DEBUG-based diagnostics`, async () => {
    process.env.DEBUG = `corepack`;
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`cache`, `clean`])).resolves.toMatchObject({
        exitCode: 0,
        stdout: ``,
        stderr: expect.stringContaining(`Package manager cache does not exist at`),
      });
    });
  });

  it.each([true, false])(`forwards package manager arguments (Corepack verbose: %s)`, async verbose => {
    await xfs.mktempPromise(async cwd => {
      await cachePackageManager(cwd);
      const args = [`--verbose`, `--filter`, `@scope/example`, `install`];
      const result = await runCli(cwd, [...(verbose ? [`--verbose`] : []), `pnpm`, ...args]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(`${JSON.stringify(args)}\n`);
      if (verbose) {
        expect(result.stderr).toContain(`corepack`);
        expect(result.stderr).toContain(`Reusing pnpm@1.0.0`);
      } else {
        expect(result.stderr).toBe(``);
      }
    });
  });

  it(`preserves a package manager's exit code`, async () => {
    await xfs.mktempPromise(async cwd => {
      await cachePackageManager(cwd);
      await expect(runCli(cwd, [`--verbose`, `pnpm`, `--fail`])).resolves.toMatchObject({exitCode: 23});
    });
  });

  it(`preserves utility command failures`, async () => {
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`--verbose`, `not-a-command`])).resolves.toMatchObject({exitCode: 1});
    });
  });

  it(`keeps --json output unchanged`, async () => {
    await xfs.mktempPromise(async cwd => {
      await cachePackageManager(cwd);
      const args = [`pack`, `pnpm@1.0.0`, `--json`];
      const plain = await runCli(cwd, args);
      const verbose = await runCli(cwd, [...args, `--verbose`]);
      expect(plain.exitCode).toBe(0);
      expect(verbose.exitCode).toBe(0);
      expect(verbose.stdout).toBe(plain.stdout);
      expect(verbose.stderr).toContain(`Reusing pnpm@1.0.0`);
      await expect(xfs.existsPromise(ppath.join(cwd, `corepack.tgz`))).resolves.toBe(true);
    });
  });
});
