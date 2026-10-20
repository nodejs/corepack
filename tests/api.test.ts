import fs                                                     from 'node:fs/promises';
import os                                                     from 'node:os';
import path                                                   from 'node:path';
import {beforeEach, afterEach, describe, expect, it, vi}      from 'vitest';

import {getSupportedPackageManagers, parsePackageManagerSpec} from '../sources/api.ts';
import {resolvePackageManager}                                from '../sources/api.ts';
import * as httpUtils                                         from '../sources/httpUtils.ts';

vi.mock(`../sources/httpUtils.ts`);

let home: string;

beforeEach(async () => {
  vi.resetAllMocks();
  home = await fs.mkdtemp(path.join(os.tmpdir(), `corepack-api-`));
  process.env.COREPACK_HOME = home;
});

afterEach(async () => {
  await fs.rm(home, {recursive: true, force: true});
});

describe(`getSupportedPackageManagers`, () => {
  it(`returns supported names without exposing the internal collection`, () => {
    const names = getSupportedPackageManagers();
    expect(names).toEqual([`npm`, `pnpm`, `yarn`]);
    names.length = 0;
    expect(getSupportedPackageManagers()).toEqual([`npm`, `pnpm`, `yarn`]);
  });
});

describe(`parsePackageManagerSpec`, () => {
  it.each([
    [`yarn@3.2.3+sha224.abcdef`, {name: `yarn`, range: `3.2.3+sha224.abcdef`}],
    [`npm@latest`, {name: `npm`, range: `latest`}],
    [`pnpm@^10.0.0`, {name: `pnpm`, range: `^10.0.0`}],
    [`yarn`, {name: `yarn`, range: `*`}],
  ])(`parses %s without network access`, (raw, expected) => {
    expect(parsePackageManagerSpec(raw)).toEqual(expected);
    expect(httpUtils.fetchAsJson).not.toHaveBeenCalled();
  });

  it.each([null, 123, {}, `unsupported@1.0.0`])(`rejects invalid input %j`, raw => {
    expect(() => parsePackageManagerSpec(raw)).toThrow();
  });

  it(`supports exact-version validation`, () => {
    expect(parsePackageManagerSpec(`npm@1.0.0`, {enforceExactVersion: true})).toEqual({name: `npm`, range: `1.0.0`});
    for (const raw of [`npm`, `npm@latest`, `npm@^1.0.0`]) {
      expect(() => parsePackageManagerSpec(raw, {enforceExactVersion: true})).toThrow();
    }
  });

  it(`keeps the CLI's custom URL policy`, () => {
    const url = `https://example.com/manager.tgz`;
    expect(parsePackageManagerSpec(`custom@${url}`)).toEqual({name: `custom`, range: url});
    expect(() => parsePackageManagerSpec(`yarn@${url}`)).toThrow(`Illegal use of URL`);
    process.env.COREPACK_ENABLE_UNSAFE_CUSTOM_URLS = `1`;
    expect(parsePackageManagerSpec(`yarn@${url}`)).toEqual({name: `yarn`, range: url});
  });
});

describe(`resolvePackageManager`, () => {
  it(`resolves exact versions with hashes offline without installing them`, async () => {
    process.env.COREPACK_ENABLE_NETWORK = `0`;
    await expect(resolvePackageManager(`pnpm@10.0.0+sha512.abcdef`)).resolves.toEqual({name: `pnpm`, reference: `10.0.0+sha512.abcdef`});
    expect(httpUtils.fetchAsJson).not.toHaveBeenCalled();
    expect(await fs.readdir(home)).toEqual([]);
  });

  it(`resolves tags using the configured registry without writing to the cache`, async () => {
    process.env.COREPACK_NPM_REGISTRY = `https://example.com/registry`;
    vi.mocked(httpUtils.fetchAsJson).mockResolvedValue({[`dist-tags`]: {latest: `10.0.0`}});
    await expect(resolvePackageManager(`pnpm@latest`)).resolves.toEqual({name: `pnpm`, reference: `10.0.0`});
    expect(httpUtils.fetchAsJson).toHaveBeenCalledWith(`https://example.com/registry/pnpm`, expect.anything());
    expect(await fs.readdir(home)).toEqual([]);
  });

  it(`can disable tag resolution`, async () => {
    await expect(resolvePackageManager(`npm@latest`, {allowTags: false})).rejects.toThrow(`can't be referenced via tags`);
    expect(httpUtils.fetchAsJson).not.toHaveBeenCalled();
  });

  it(`prefers cached versions for ranges and supports bypassing the cache`, async () => {
    await fs.mkdir(path.join(home, `v1`, `npm`, `1.0.0`), {recursive: true});
    await expect(resolvePackageManager(`npm@^1.0.0`)).resolves.toEqual({name: `npm`, reference: `1.0.0`});
    expect(httpUtils.fetchAsJson).not.toHaveBeenCalled();
    vi.mocked(httpUtils.fetchAsJson).mockResolvedValue({versions: {"1.0.0": {}, "1.2.0": {}, "2.0.0": {}}});
    await expect(resolvePackageManager(`npm@^1.0.0`, {useCache: false})).resolves.toEqual({name: `npm`, reference: `1.2.0`});
  });

  it(`returns null when no version satisfies a range`, async () => {
    vi.mocked(httpUtils.fetchAsJson).mockResolvedValue({versions: {"2.0.0": {}}});
    await expect(resolvePackageManager(`npm@^1.0.0`)).resolves.toBeNull();
  });

  it(`rejects invalid input, unknown tags, and registry errors`, async () => {
    await expect(resolvePackageManager(`unsupported@1.0.0`)).rejects.toThrow(`Unsupported package manager`);
    vi.mocked(httpUtils.fetchAsJson).mockResolvedValue({[`dist-tags`]: {}});
    await expect(resolvePackageManager(`npm@missing`)).rejects.toThrow(`Tag not found`);
    vi.mocked(httpUtils.fetchAsJson).mockRejectedValue(new Error(`registry unavailable`));
    await expect(resolvePackageManager(`npm@latest`)).rejects.toThrow(`registry unavailable`);
  });

  it(`honors disabled network access for uncached ranges`, async () => {
    process.env.COREPACK_ENABLE_NETWORK = `0`;
    await expect(resolvePackageManager(`npm@^1.0.0`)).rejects.toThrow(`Network access disabled`);
    expect(httpUtils.fetchAsJson).not.toHaveBeenCalled();
  });

  it(`returns custom URLs without fetching them`, async () => {
    const url = `https://example.com/manager.tgz#sha224.abcdef`;
    await expect(resolvePackageManager(`custom@${url}`)).resolves.toEqual({name: `custom`, reference: url});
    expect(httpUtils.fetchAsJson).not.toHaveBeenCalled();
  });
});
