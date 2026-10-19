import {npath, ppath, xfs}      from '@yarnpkg/fslib';
import {execFile}               from 'node:child_process';
import {promisify}              from 'node:util';
import {beforeEach, expect, it} from 'vitest';

import {runCli}                 from './_runCli.ts';

beforeEach(() => {
  process.env.COREPACK_DEFAULT_TO_LATEST = `0`;
});

it(`uses user configuration for global utility commands`, async () => {
  await xfs.mktempPromise(async cwd => {
    const home = ppath.join(cwd, `cache`);
    const userConfig = ppath.join(cwd, `user.rc`);
    await xfs.mkdirPromise(ppath.join(home, `v1/yarn/1.22.4`), {recursive: true});
    await xfs.writeFilePromise(userConfig, `COREPACK_HOME=${JSON.stringify(npath.fromPortablePath(home))}\n`);
    process.env.COREPACK_CONFIG_FILE = `user.rc`;
    await expect(runCli(cwd, [`cache`, `clean`])).resolves.toEqual({exitCode: 0, stdout: ``, stderr: ``});
    expect(await xfs.existsPromise(ppath.join(home, `v1`))).toBe(false);
  });
});

it.each([`user`, `project`, `environment`])(`respects configuration precedence through the CLI (%s)`, async level => {
  await xfs.mktempPromise(async cwd => {
    const home = ppath.join(cwd, `cache`);
    const cache = ppath.join(home, `v1/yarn/1.22.4`);
    const config = ppath.join(cwd, `user.rc`);
    await xfs.mkdirPromise(cache, {recursive: true});
    await xfs.writeJsonPromise(ppath.join(cache, `.corepack`), {bin: {yarn: `yarn.js`}, hash: `sha512.${`ab`.repeat(64)}`});
    await xfs.writeFilePromise(ppath.join(cache, `yarn.js`), `console.log('1.22.4');`);
    await xfs.writeJsonPromise(ppath.join(home, `lastKnownGood.json`), {yarn: `1.22.4`});
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {name: `config-test`});
    await xfs.writeFilePromise(config, `COREPACK_HOME=${JSON.stringify(npath.fromPortablePath(home))}\nCOREPACK_ENABLE_NETWORK=0\nCOREPACK_ENABLE_AUTO_PIN=1\nCOREPACK_ENV_FILE=project.env\n`);
    process.env.COREPACK_CONFIG_FILE = npath.fromPortablePath(config);
    if (level !== `user`)
      await xfs.writeFilePromise(ppath.join(cwd, `project.env`), `COREPACK_ENABLE_AUTO_PIN=0\n`);
    if (level === `environment`)
      process.env.COREPACK_ENABLE_AUTO_PIN = `1`;

    const result = await runCli(cwd, [`yarn`, `--version`]);
    expect(result).toMatchObject({exitCode: 0, stdout: `1.22.4\n`});
    const manifest = await xfs.readJsonPromise(ppath.join(cwd, `package.json`));
    if (level === `project`) {
      expect(manifest.packageManager).toBeUndefined();
      expect(result.stderr).toBe(``);
    } else {
      expect(manifest.packageManager).toMatch(/^yarn@1\.22\.4\+sha512\./);
    }
  });
});

it.each([
  {fileValue: `0`, envValue: undefined, shouldPrompt: false},
  {fileValue: `1`, envValue: undefined, shouldPrompt: true},
  {fileValue: `0`, envValue: `1`, shouldPrompt: true},
])(`loads the download-prompt setting before initializing shims ($fileValue, $envValue)`, async ({fileValue, envValue, shouldPrompt}) => {
  await xfs.mktempPromise(async cwd => {
    const config = ppath.join(cwd, `user.rc`);
    process.env.COREPACK_HOME = npath.fromPortablePath(ppath.join(cwd, `cache`));
    process.env.COREPACK_CONFIG_FILE = npath.fromPortablePath(config);
    await xfs.writeFilePromise(config, `COREPACK_ENABLE_DOWNLOAD_PROMPT=${fileValue}\n`);
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json`), {packageManager: `yarn@1.22.4`});
    if (envValue !== undefined)
      process.env.COREPACK_ENABLE_DOWNLOAD_PROMPT = envValue;
    const {stdout, stderr} = await promisify(execFile)(process.execPath, [`--no-warnings`, `--require`, require.resolve(`./recordRequests.js`), require.resolve(`../dist/yarn.js`), `--version`], {
      cwd: npath.fromPortablePath(cwd),
      env: process.env,
      timeout: 20000,
    });
    expect(stdout).toBe(`1.22.4\n`);
    expect(stderr.includes(`Corepack is about to download`)).toBe(shouldPrompt);
  });
});
