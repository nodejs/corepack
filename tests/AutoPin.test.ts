import type {PortablePath}      from '@yarnpkg/fslib';
import {npath, ppath, xfs}      from '@yarnpkg/fslib';
import {spawn}                  from 'node:child_process';
import process                  from 'node:process';
import {beforeEach, expect, it} from 'vitest';

const reference = `yarn@1.22.4+sha512.${`ab`.repeat(64)}`;
const manifest = `{\n  "name": "auto-pin-test"\n}\n`;

beforeEach(async () => {
  const home = await xfs.mktempPromise();
  process.env.COREPACK_HOME = npath.fromPortablePath(home);
  process.env.COREPACK_ENABLE_AUTO_PIN = `1`;
  process.env.COREPACK_ENABLE_NETWORK = `0`;
  process.env.COREPACK_DEFAULT_TO_LATEST = `0`;
  delete process.env.CI;

  // A cached executable keeps prompt tests independent of registry downloads.
  const cache = ppath.join(home, `v1/yarn/1.22.4`);
  await xfs.mkdirPromise(cache, {recursive: true});
  await xfs.writeJsonPromise(ppath.join(cache, `.corepack`), {
    locator: {name: `yarn`, reference: `1.22.4`},
    bin: {yarn: `yarn.js`},
    hash: reference.split(`+`)[1],
  });
  await xfs.writeFilePromise(ppath.join(cache, `yarn.js`), `process.stdout.write('package manager ran\\n');`);
  await xfs.writeJsonPromise(ppath.join(home, `lastKnownGood.json`), {yarn: `1.22.4`});

  return () => xfs.removePromise(home, {recursive: true});
});

async function runPrompt(cwd: PortablePath, {answer, tty = true}: {answer?: string, tty?: boolean} = {}) {
  const preload = ppath.join(cwd, `tty.cjs`);
  await xfs.writeFilePromise(preload, `Object.defineProperty(process.stdin, 'isTTY', {value: ${tty}});`);

  return await new Promise<{exitCode: number | null, stdout: string, stderr: string}>((resolve, reject) => {
    const child = spawn(process.execPath, [`--require`, npath.fromPortablePath(preload), require.resolve(`../dist/corepack.js`), `yarn`, `--version`], {
      cwd: npath.fromPortablePath(cwd),
      env: process.env,
      stdio: `pipe`,
    });
    let stdout = ``;
    let stderr = ``;
    let answered = false;
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out waiting for auto-pin prompt: ${stderr}`));
    }, 10000);
    child.stdout.on(`data`, chunk => {
      stdout += chunk;
    });
    child.stderr.on(`data`, chunk => {
      stderr += chunk;
      if (!answered && stderr.includes(`[y/N] `)) {
        answered = true;
        child.stdin.end(answer);
      }
    });
    child.on(`error`, error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on(`close`, exitCode => {
      clearTimeout(timeout);
      resolve({exitCode, stdout, stderr});
    });
  });
}

it.each([`y\n`, `YES\n`])(`pins after confirmation %j and runs the package manager`, async answer => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeFilePromise(ppath.join(cwd, `package.json`), manifest);
    const result = await runPrompt(cwd, {answer});
    expect(result).toMatchObject({exitCode: 0, stdout: `package manager ran\n`});
    expect(result.stderr).toContain(`to ${npath.fromPortablePath(ppath.join(cwd, `package.json`))}? [y/N] `);
    await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toMatchObject({packageManager: reference});

    // Once pinned, invoking the same command does not prompt again.
    await expect(runPrompt(cwd)).resolves.toEqual({exitCode: 0, stdout: `package manager ran\n`, stderr: ``});
  });
});

it.each([`n\n`, `\n`, `unexpected\n`, undefined])(`leaves the manifest unchanged after %j and still runs the command`, async answer => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeFilePromise(ppath.join(cwd, `package.json`), manifest);
    const result = await runPrompt(cwd, {answer});
    expect(result).toMatchObject({exitCode: 0, stdout: `package manager ran\n`});
    expect(result.stderr).toContain(`[y/N] `);
    expect(result.stderr).not.toContain(`Corepack will now add one`);
    await expect(xfs.readFilePromise(ppath.join(cwd, `package.json`), `utf8`)).resolves.toBe(manifest);
  });
});

it.each([`CI`, `pipe`])(`pins without prompting with %s input`, async mode => {
  if (mode === `CI`)
    process.env.CI = `1`;
  await xfs.mktempPromise(async cwd => {
    await xfs.writeFilePromise(ppath.join(cwd, `package.json`), manifest);
    const result = await runPrompt(cwd, {tty: mode !== `pipe`});
    expect(result).toMatchObject({exitCode: 0, stdout: `package manager ran\n`});
    expect(result.stderr).not.toContain(`[y/N] `);
    await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json`))).resolves.toMatchObject({packageManager: reference});
  });
});

it(`does not prompt or pin when auto-pinning is disabled`, async () => {
  process.env.COREPACK_ENABLE_AUTO_PIN = `0`;
  await xfs.mktempPromise(async cwd => {
    await xfs.writeFilePromise(ppath.join(cwd, `package.json`), manifest);
    await expect(runPrompt(cwd)).resolves.toEqual({exitCode: 0, stdout: `package manager ran\n`, stderr: ``});
    await expect(xfs.readFilePromise(ppath.join(cwd, `package.json`), `utf8`)).resolves.toBe(manifest);
  });
});
