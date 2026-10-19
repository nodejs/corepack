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

describe(`--dir`, () => {
  it.each([
    {absolute: false, bound: false},
    {absolute: false, bound: true},
    {absolute: true, bound: false},
    {absolute: true, bound: true},
  ])(`uses the target manifest with absolute=$absolute, bound=$bound`, async ({absolute, bound}) => {
    await xfs.mktempPromise(async cwd => {
      const project = ppath.join(cwd, `project @scope`);
      await xfs.mkdirPromise(project);
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {packageManager: `yarn@1.22.4`});
      await xfs.writeJsonPromise(ppath.join(project, `package.json`), {packageManager: `pnpm@1.9998.9999`});

      const directory = absolute ? npath.fromPortablePath(project) : `project @scope`;
      const options = bound ? [`--dir=${directory}`] : [`--dir`, directory];
      await expect(runCli(cwd, [...options, `pnpm`, `--version`], true)).resolves.toEqual({
        exitCode: 0,
        stdout: `pnpm: Hello from custom registry\n`,
        stderr: ``,
      });
    });
  });

  it(`runs Corepack utility commands in the target project`, async () => {
    await xfs.mktempPromise(async cwd => {
      const project = ppath.join(cwd, `project`);
      await xfs.mkdirPromise(project);
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {packageManager: `yarn@1.22.4`});
      await xfs.writeJsonPromise(ppath.join(project, `package.json`), {packageManager: `pnpm@1.9998.9999`});

      await expect(runCli(cwd, [`--dir`, `project`, `install`], true)).resolves.toEqual({
        exitCode: 0,
        stdout: `Adding pnpm@1.9998.9999 to the cache...\n`,
        stderr: ``,
      });

      process.env.COREPACK_ENABLE_NETWORK = `0`;
      await expect(runCli(cwd, [`--dir`, `project`, `pnpm`, `--version`], true)).resolves.toEqual({
        exitCode: 0,
        stdout: `pnpm: Hello from custom registry\n`,
        stderr: ``,
      });
    });
  });

  it(`changes the executed process cwd and forwards the package manager's own --dir`, async () => {
    process.env.CI = `1`;

    await xfs.mktempPromise(async cwd => {
      const project = ppath.join(cwd, `project`);
      const nested = ppath.join(project, `nested`);
      await xfs.mkdirPromise(nested, {recursive: true});
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {packageManager: `yarn@1.22.4`});
      await xfs.writeJsonPromise(ppath.join(project, `package.json`), {packageManager: `pnpm@6.6.2`});
      await xfs.writeJsonPromise(ppath.join(nested, `package.json`), {private: true});
      await xfs.writeFilePromise(ppath.join(nested, `print-cwd.cjs`), `console.log(process.cwd());\n`);

      await expect(runCli(cwd, [`--dir`, `project`, `pnpm`, `--dir`, `nested`, `exec`, `node`, `print-cwd.cjs`])).resolves.toEqual({
        exitCode: 0,
        stdout: `${npath.fromPortablePath(nested)}\n`,
        stderr: ``,
      });
    });
  });

  it(`loads the target .corepack.env and propagates command failures`, async () => {
    await xfs.mktempPromise(async cwd => {
      const project = ppath.join(cwd, `project`);
      await xfs.mkdirPromise(project);
      await xfs.writeFilePromise(ppath.join(project, `.corepack.env`), `COREPACK_ENABLE_NETWORK=0\n`);

      await expect(runCli(cwd, [`--dir`, `project`, `use`, `pnpm@latest`], true)).resolves.toMatchObject({
        exitCode: 1,
        stdout: expect.stringContaining(`Network access disabled by the environment`),
        stderr: ``,
      });
    });
  });

  it.each([false, true])(`reports an invalid directory with existing file=%s`, async existingFile => {
    await xfs.mktempPromise(async cwd => {
      if (existingFile)
        await xfs.writeFilePromise(ppath.join(cwd, `invalid`), ``);

      await expect(runCli(cwd, [`--dir`, `invalid`, `install`])).resolves.toMatchObject({
        exitCode: 1,
        stdout: expect.stringContaining(`Couldn't change directory to`),
        stderr: ``,
      });
    });
  });

  it.each([[`--dir`], [`--dir`, `.`]])(`rejects incomplete arguments %j`, async (...args) => {
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, args)).resolves.toMatchObject({exitCode: 1});
    });
  });

  it(`keeps the other commands visible in the main help`, async () => {
    await xfs.mktempPromise(async cwd => {
      const result = await runCli(cwd, [`--help`]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`corepack use`);
      expect(result.stdout).toContain(`corepack up`);
      expect(result.stdout).toContain(`--dir`);
    });
  });
});
