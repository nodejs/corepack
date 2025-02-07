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

describe(`UpCommand`, () => {
  it(`should update the "packageManager" field from the current project`, async () => {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
        packageManager: `yarn@2.1.0`,
      });

      await expect(runCli(cwd, [`up`])).resolves.toMatchObject({
        exitCode: 0,
        stderr: ``,
      });

      await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toMatchObject({
        packageManager: `yarn@2.4.3+sha512.8dd9fedc5451829619e526c56f42609ad88ae4776d9d3f9456d578ac085115c0c2f0fb02bb7d57fd2e1b6e1ac96efba35e80a20a056668f61c96934f67694fd0`,
      });

      await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
        exitCode: 0,
        stdout: `2.4.3\n`,
      });
    });
  });

  it(`should update the ".corepack.env" file from the current project`, async t => {
    // Skip that test on Node.js 18.x as it lacks support for .env files.
    if (process.version.startsWith(`v18.`)) t.skip();
    await Promise.all([
      `COREPACK_DEV_ENGINES_YARN=2.1.0\n`,
      `\nCOREPACK_DEV_ENGINES_YARN=2.1.0\n`,
      `COREPACK_DEV_ENGINES_YARN=2.1.0`,
      `\nCOREPACK_DEV_ENGINES_YARN=2.1.0`,
      `FOO=bar\nCOREPACK_DEV_ENGINES_YARN=2.1.0\n`,
      `FOO=bar\nCOREPACK_DEV_ENGINES_YARN=2.1.0`,
    ].map(originalEnv => xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
        devEngines: {packageManager: {name: `yarn`, version: `2.x`}},
      });
      await xfs.writeFilePromise(ppath.join(cwd, `.corepack.env`), originalEnv);

      await expect(runCli(cwd, [`up`])).resolves.toMatchObject({
        exitCode: 0,
        stderr: ``,
      });

      try {
        await expect(xfs.readFilePromise(ppath.join(cwd, `.corepack.env`), `utf-8`).then(parseEnv)).resolves.toMatchObject({
          COREPACK_DEV_ENGINES_YARN: `2.4.3+sha512.8dd9fedc5451829619e526c56f42609ad88ae4776d9d3f9456d578ac085115c0c2f0fb02bb7d57fd2e1b6e1ac96efba35e80a20a056668f61c96934f67694fd0`,
        });
      } catch (cause) {
        throw new Error(JSON.stringify(originalEnv), {cause});
      }

      await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
        exitCode: 0,
        stdout: `2.4.3\n`,
      });
    })));
  });

  it(`should update the ".other.env" file from the current project when configured to use that`, async t => {
    // Skip that test on Node.js 18.x as it lacks support for .env files.
    if (process.version.startsWith(`v18.`)) t.skip();

    await Promise.all([
      `COREPACK_DEV_ENGINES_YARN=2.1.0\n`,
      `\nCOREPACK_DEV_ENGINES_YARN=2.1.0\n`,
      `COREPACK_DEV_ENGINES_YARN=2.1.0`,
      `\nCOREPACK_DEV_ENGINES_YARN=2.1.0`,
      `FOO=bar\nCOREPACK_DEV_ENGINES_YARN=2.1.0\n`,
      `FOO=bar\nCOREPACK_DEV_ENGINES_YARN=2.1.0`,
    ].map(originalEnv => xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {
        devEngines: {packageManager: {name: `yarn`, version: `2.x`}},
      });
      await xfs.writeFilePromise(ppath.join(cwd, `.other.env`), originalEnv);

      process.env.COREPACK_ENV_FILE = `.other.env`;
      await expect(runCli(cwd, [`up`])).resolves.toMatchObject({
        exitCode: 0,
        stderr: ``,
      });

      try {
        await expect(xfs.readFilePromise(ppath.join(cwd, `.other.env`), `utf-8`).then(parseEnv)).resolves.toMatchObject({
          COREPACK_DEV_ENGINES_YARN: `2.4.3+sha512.8dd9fedc5451829619e526c56f42609ad88ae4776d9d3f9456d578ac085115c0c2f0fb02bb7d57fd2e1b6e1ac96efba35e80a20a056668f61c96934f67694fd0`,
        });
      } catch (cause) {
        throw new Error(JSON.stringify(originalEnv), {cause});
      }

      await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
        exitCode: 0,
        stdout: `2.4.3\n`,
      });
    })));
  });
});
