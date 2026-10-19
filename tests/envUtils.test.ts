import {npath, ppath, xfs}                     from '@yarnpkg/fslib';
import os                                      from 'node:os';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';

import {loadUserConfig, mergeProjectEnv}       from '../sources/envUtils.ts';

beforeEach(async () => {
  const home = await xfs.mktempPromise();
  vi.spyOn(os, `homedir`).mockReturnValue(npath.fromPortablePath(home));
  delete process.env.COREPACK_CONFIG_FILE;
  return () => xfs.removePromise(home, {recursive: true});
});

afterEach(() => vi.restoreAllMocks());

async function writeConfig(content: string) {
  await xfs.writeFilePromise(ppath.join(npath.toPortablePath(os.homedir()), `.corepackrc`), content);
}

it(`ignores a missing default user configuration`, async () => {
  await loadUserConfig();
  expect(process.env.COREPACK_ENABLE_AUTO_PIN).toBeUndefined();
  expect(process.env.COREPACK_ENABLE_DOWNLOAD_PROMPT).toBeUndefined();
});

it(`reads dotenv syntax but only applies Corepack settings`, async () => {
  await writeConfig(`
    # User defaults
    COREPACK_DEFAULT_TO_LATEST="0"
    COREPACK_ENABLE_DOWNLOAD_PROMPT='0'
    COREPACK_CONFIG_FILE=ignored
    NODE_OPTIONS=--invalid
    PATH=ignored
  `);
  const {PATH, NODE_OPTIONS} = process.env;
  await loadUserConfig();
  expect(process.env.COREPACK_DEFAULT_TO_LATEST).toBe(`0`);
  expect(process.env.COREPACK_ENABLE_DOWNLOAD_PROMPT).toBe(`0`);
  expect(process.env.COREPACK_CONFIG_FILE).toBeUndefined();
  expect(process.env.PATH).toBe(PATH);
  expect(process.env.NODE_OPTIONS).toBe(NODE_OPTIONS);
});

it(`lets project settings override user defaults`, async () => {
  await writeConfig(`COREPACK_ENABLE_AUTO_PIN=0\n`);
  await loadUserConfig();
  expect(mergeProjectEnv(`COREPACK_ENABLE_AUTO_PIN=1\n`).COREPACK_ENABLE_AUTO_PIN).toBe(`1`);
});

it.each([`0`, `1`, ``])(`preserves explicit environment values %j over both files`, async value => {
  process.env.COREPACK_ENABLE_AUTO_PIN = value;
  await writeConfig(`COREPACK_ENABLE_AUTO_PIN=0\n`);
  await loadUserConfig();
  expect(mergeProjectEnv(`COREPACK_ENABLE_AUTO_PIN=other\n`).COREPACK_ENABLE_AUTO_PIN).toBe(value);
});

it(`keeps user-only settings out of project environment files`, async () => {
  await writeConfig(`COREPACK_ENABLE_DOWNLOAD_PROMPT=0\nCOREPACK_ENV_FILE=project.env\n`);
  await loadUserConfig();
  const env = mergeProjectEnv(`COREPACK_ENABLE_DOWNLOAD_PROMPT=1\nCOREPACK_ENV_FILE=other.env\nCOREPACK_CONFIG_FILE=other.rc\nNODE_OPTIONS=--invalid\n`);
  expect(env.COREPACK_ENABLE_DOWNLOAD_PROMPT).toBe(`0`);
  expect(env.COREPACK_ENV_FILE).toBe(`project.env`);
  expect(env.COREPACK_CONFIG_FILE).toBeUndefined();
  expect(env.NODE_OPTIONS).toBe(process.env.NODE_OPTIONS);
});

it(`does not apply user defaults to a different process environment`, async () => {
  await writeConfig(`COREPACK_ENABLE_AUTO_PIN=0\n`);
  await loadUserConfig();
  process.env = {...process.env};
  expect(mergeProjectEnv(`COREPACK_ENABLE_AUTO_PIN=1\n`).COREPACK_ENABLE_AUTO_PIN).toBe(`0`);
});

it(`can disable user configuration`, async () => {
  await writeConfig(`COREPACK_ENABLE_AUTO_PIN=1\n`);
  process.env.COREPACK_CONFIG_FILE = `0`;
  await loadUserConfig();
  expect(process.env.COREPACK_ENABLE_AUTO_PIN).toBeUndefined();
});

it(`reports an explicitly selected missing configuration file`, async () => {
  process.env.COREPACK_CONFIG_FILE = `${os.homedir()}/missing`;
  await expect(loadUserConfig()).rejects.toMatchObject({code: `ENOENT`});
});

it(`reports an unreadable configuration instead of silently ignoring it`, async () => {
  process.env.COREPACK_CONFIG_FILE = os.homedir();
  await expect(loadUserConfig()).rejects.toMatchObject({code: `EISDIR`});
});
