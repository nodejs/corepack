import {beforeEach, describe, it, expect, vi}                              from 'vitest';

import {shouldSkipIntegrityCheck}                                          from '../sources/corepackUtils.ts';
import {fetchAvailableVersions, fetchLatestStableVersion, fetchTagVersion} from '../sources/corepackUtils.ts';
import {fetchAsJson}                                                       from '../sources/httpUtils.ts';
import type {UrlRegistrySpec}                                              from '../sources/types.ts';

vi.mock(`../sources/httpUtils.ts`);

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

describe(`URL registry release age`, () => {
  const registry: UrlRegistrySpec = {type: `url`, url: `https://example.test/tags`, fields: {tags: `aliases`, versions: `tags`}};

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.COREPACK_MINIMUM_RELEASE_AGE = `60`;
  });

  it.each([`tag`, `range`, `latest`])(`filters publish times when resolving a %s`, async mode => {
    vi.mocked(fetchAsJson).mockResolvedValue({
      aliases: {stable: `2.0.0`},
      tags: [`1.0.0`, `2.0.0`],
      time: {'1.0.0': `2000-01-01T00:00:00Z`, '2.0.0': new Date().toISOString()},
    });

    if (mode === `tag`) {
      await expect(fetchTagVersion(registry, `stable`)).resolves.toBe(`1.0.0`);
    } else if (mode === `range`) {
      await expect(fetchAvailableVersions(registry)).resolves.toEqual([`1.0.0`]);
    } else {
      await expect(fetchLatestStableVersion(registry)).resolves.toBe(`1.0.0`);
    }
  });

  it(`does not bypass the gate when publish times are unavailable`, async () => {
    vi.mocked(fetchAsJson).mockResolvedValue({aliases: {stable: `1.0.0`}, tags: {'1.0.0': {}}});
    await expect(fetchAvailableVersions(registry)).resolves.toEqual([]);
    await expect(fetchTagVersion(registry, `stable`)).rejects.toThrow(`No ${registry.url} release older than 60 minutes is available`);
  });
});
