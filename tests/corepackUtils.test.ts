import {beforeEach, describe, it, expect, vi}               from 'vitest';

import {fetchLatestStableVersion, shouldSkipIntegrityCheck} from '../sources/corepackUtils.ts';
import * as httpUtils                                       from '../sources/httpUtils.ts';
import * as npmRegistryUtils                                from '../sources/npmRegistryUtils.ts';

vi.mock(`../sources/httpUtils.ts`);
vi.mock(`../sources/npmRegistryUtils.ts`);

describe(`latest stable version`, () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(`selects the stable alias from a URL registry`, async () => {
    vi.mocked(httpUtils.fetchAsJson).mockResolvedValue({aliases: {stable: `4.99.0`, canary: `5.0.0-rc.1`}});

    await expect(fetchLatestStableVersion({
      type: `url`, url: `https://repo.yarnpkg.com/tags`, fields: {tags: `aliases`, versions: `tags`},
    })).resolves.toBe(`4.99.0`);
  });

  it(`does not use a tarball hash to verify an extracted binary`, async () => {
    vi.mocked(npmRegistryUtils.fetchLatestStableVersion).mockResolvedValue(`4.99.0+sha512.abcdef`);

    await expect(fetchLatestStableVersion({type: `npm`, package: `@yarnpkg/cli-dist`, bin: `bin/yarn.js`})).resolves.toBe(`4.99.0`);
    expect(npmRegistryUtils.fetchLatestStableVersion).toHaveBeenCalledWith(`@yarnpkg/cli-dist`);
  });

  it(`retains the tarball hash for package managers installed as tarballs`, async () => {
    vi.mocked(npmRegistryUtils.fetchLatestStableVersion).mockResolvedValue(`12.0.0+sha512.abcdef`);

    await expect(fetchLatestStableVersion({type: `npm`, package: `npm`})).resolves.toBe(`12.0.0+sha512.abcdef`);
  });
});

describe(`corepack utils shouldSkipIntegrityCheck`, () => {
  it(`should return false if COREPACK_INTEGRITY_KEYS env is not set`, () => {
    delete process.env.COREPACK_INTEGRITY_KEYS;
    expect(shouldSkipIntegrityCheck()).toBe(false);
  });

  it(`should return true if COREPACK_INTEGRITY_KEYS env is set to 0`, () => {
    process.env.COREPACK_INTEGRITY_KEYS = `0`;
    expect(shouldSkipIntegrityCheck()).toBe(true);
  });

  it(`should return true if COREPACK_INTEGRITY_KEYS env is set to an empty string`, () => {
    process.env.COREPACK_INTEGRITY_KEYS = ``;
    expect(shouldSkipIntegrityCheck()).toBe(true);
  });

  it(`should return false if COREPACK_INTEGRITY_KEYS env is set to any other value`, () => {
    process.env.COREPACK_INTEGRITY_KEYS = JSON.stringify({foo: `bar`});
    expect(shouldSkipIntegrityCheck()).toBe(false);
  });
});
