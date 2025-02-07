import {ppath, xfs, npath}                from '@yarnpkg/fslib';
import process                            from 'node:process';
import {parseEnv}                         from 'node:util';
import {describe, beforeEach, it, expect} from 'vitest';

import {runCli}                           from './_runCli';

beforeEach(async () => {
  // `process.env` is reset after each tests in setupTests.js.
  process.env.COREPACK_HOME = npath.fromPortablePath(await xfs.mktempPromise());
  process.env.COREPACK_DEFAULT_TO_LATEST = `0`;
});

describe(`UseCommand`, () => {
  it(`should update the "packageManager" field in the current project`, async () => {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
        packageManager: `yarn@1.0.0`,
      });

      await expect(runCli(cwd, [`use`, `yarn@1.22.4`])).resolves.toMatchObject({
        exitCode: 0,
      });

      await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toMatchObject({
        packageManager: `yarn@1.22.4+sha512.a1833b862fe52169bd6c2a033045a07df5bc6a23595c259e675fed1b2d035ab37abe6ce309720abb6636d68f03615054b6292dc0a70da31c8697fda228b50d18`,
      });

      await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
        exitCode: 0,
        stdout: `1.22.4\n`,
      });
    });
  });

  it(`should update .corepack.env if present`, async t => {
    // Skip that test on Node.js 18.x as it lacks support for .env files.
    if (process.version.startsWith(`v18.`)) t.skip();

    await Promise.all([
      `COREPACK_DEV_ENGINES_YARN=1.1.0\n`,
      `\nCOREPACK_DEV_ENGINES_YARN=1.1.0\n`,
      `COREPACK_DEV_ENGINES_YARN=1.1.0`,
      `\nCOREPACK_DEV_ENGINES_YARN=1.1.0`,
      `FOO=bar\nCOREPACK_DEV_ENGINES_YARN=1.1.0\n`,
      `FOO=bar\nCOREPACK_DEV_ENGINES_YARN=1.1.0`,
    ].map(originalEnv => xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
        devEngines: {packageManager: {name: `yarn`, version: `1.x`}},
      });
      await xfs.writeFilePromise(ppath.join(cwd, `.corepack.env`), `COREPACK_DEV_ENGINES_YARN=1.0.0\n`);

      await expect(runCli(cwd, [`use`, `yarn@1.22.4`])).resolves.toMatchObject({
        exitCode: 0,
      });

      try {
        await expect(xfs.readFilePromise(ppath.join(cwd, `.corepack.env`), `utf-8`).then(parseEnv)).resolves.toMatchObject({
          COREPACK_DEV_ENGINES_YARN: `1.22.4+sha512.a1833b862fe52169bd6c2a033045a07df5bc6a23595c259e675fed1b2d035ab37abe6ce309720abb6636d68f03615054b6292dc0a70da31c8697fda228b50d18`,
        });
      } catch (cause) {
        throw new Error(JSON.stringify(originalEnv), {cause});
      }

      await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
        exitCode: 0,
        stdout: `1.22.4\n`,
      });
    })));
  });

  it(`should update .other.env if present`, async t => {
    // Skip that test on Node.js 18.x as it lacks support for .env files.
    if (process.version.startsWith(`v18.`)) t.skip();

    await Promise.all([
      `COREPACK_DEV_ENGINES_YARN=1.1.0\n`,
      `\nCOREPACK_DEV_ENGINES_YARN=1.1.0\n`,
      `COREPACK_DEV_ENGINES_YARN=1.1.0`,
      `\nCOREPACK_DEV_ENGINES_YARN=1.1.0`,
      `FOO=bar\nCOREPACK_DEV_ENGINES_YARN=1.1.0\n`,
      `FOO=bar\nCOREPACK_DEV_ENGINES_YARN=1.1.0`,
    ].map(originalEnv => xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
        devEngines: {packageManager: {name: `yarn`, version: `1.x`}},
      });
      await xfs.writeFilePromise(ppath.join(cwd, `.other.env`), `COREPACK_DEV_ENGINES_YARN=1.0.0\n`);

      process.env.COREPACK_ENV_FILE = `.other.env`;
      await expect(runCli(cwd, [`use`, `yarn@1.22.4`])).resolves.toMatchObject({
        exitCode: 0,
      });

      try {
        await expect(xfs.readFilePromise(ppath.join(cwd, `.other.env`), `utf-8`).then(parseEnv)).resolves.toMatchObject({
          COREPACK_DEV_ENGINES_YARN: `1.22.4+sha512.a1833b862fe52169bd6c2a033045a07df5bc6a23595c259e675fed1b2d035ab37abe6ce309720abb6636d68f03615054b6292dc0a70da31c8697fda228b50d18`,
        });
      } catch (cause) {
        throw new Error(JSON.stringify(originalEnv), {cause});
      }

      await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
        exitCode: 0,
        stdout: `1.22.4\n`,
      });
    })));
  });

  it(`should create a package.json if absent`, async () => {
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`use`, `yarn@1.22.4`])).resolves.toMatchObject({
        exitCode: 0,
        stderr: `warning package.json: No license field\nwarning No license field\n`,
      });

      await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toMatchObject({
        packageManager: `yarn@1.22.4+sha512.a1833b862fe52169bd6c2a033045a07df5bc6a23595c259e675fed1b2d035ab37abe6ce309720abb6636d68f03615054b6292dc0a70da31c8697fda228b50d18`,
      });

      await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
        exitCode: 0,
        stdout: `1.22.4\n`,
        stderr: ``,
      });

      // Ensure Corepack is able to detect package.json in parent directory
      const subfolder = ppath.join(cwd, `subfolder`);
      await xfs.mkdirPromise(subfolder);

      await expect(runCli(subfolder, [`use`, `yarn@2.2.2`])).resolves.toMatchObject({
        exitCode: 0,
        stderr: ``,
      });
      await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
        exitCode: 0,
        stdout: `2.2.2\n`,
        stderr: ``,
      });
    });
  });
});
