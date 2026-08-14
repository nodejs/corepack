import {Buffer}                                                                           from 'node:buffer';
import process                                                                            from 'node:process';
import {describe, beforeEach, it, expect, vi}                                             from 'vitest';

import {fetchAsJson as httpFetchAsJson}                                                   from '../sources/httpUtils.ts';
import {DEFAULT_HEADERS, DEFAULT_NPM_REGISTRY_URL, fetchAsJson, fetchLatestStableVersion} from '../sources/npmRegistryUtils.ts';

vi.mock(`../sources/httpUtils.ts`);

describe(`npm registry utils fetchAsJson`, () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(`throw usage error if COREPACK_ENABLE_NETWORK env is set to 0`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_ENABLE_NETWORK = `0`;

    await expect(fetchAsJson(`package-name`)).rejects.toThrowError();
  });

  it(`loads from DEFAULT_NPM_REGISTRY_URL by default`, async () => {
    await fetchAsJson(`package-name`);

    expect(httpFetchAsJson).toBeCalled();
    expect(httpFetchAsJson).lastCalledWith(`${DEFAULT_NPM_REGISTRY_URL}/package-name`, {headers: DEFAULT_HEADERS});
  });

  it(`loads from custom COREPACK_NPM_REGISTRY if set`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_NPM_REGISTRY = `https://registry.example.org`;
    await fetchAsJson(`package-name`);

    expect(httpFetchAsJson).toBeCalled();
    expect(httpFetchAsJson).lastCalledWith(`${process.env.COREPACK_NPM_REGISTRY}/package-name`, {headers: DEFAULT_HEADERS});
  });

  it(`adds authorization header with bearer token if COREPACK_NPM_TOKEN is set`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_NPM_TOKEN = `foo`;

    await fetchAsJson(`package-name`);

    expect(httpFetchAsJson).toBeCalled();
    expect(httpFetchAsJson).lastCalledWith(`${DEFAULT_NPM_REGISTRY_URL}/package-name`, {headers: {
      ...DEFAULT_HEADERS,
      authorization: `Bearer ${process.env.COREPACK_NPM_TOKEN}`,
    }});
  });

  it(`only adds authorization header with bearer token if COREPACK_NPM_TOKEN and COREPACK_NPM_USERNAME are set`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_NPM_TOKEN = `foo`;
    process.env.COREPACK_NPM_USERNAME = `bar`;
    process.env.COREPACK_NPM_PASSWORD = `foobar`;

    await fetchAsJson(`package-name`);

    expect(httpFetchAsJson).toBeCalled();
    expect(httpFetchAsJson).lastCalledWith(`${DEFAULT_NPM_REGISTRY_URL}/package-name`, {headers: {
      ...DEFAULT_HEADERS,
      authorization: `Bearer ${process.env.COREPACK_NPM_TOKEN}`,
    }});
  });


  it(`adds authorization header with basic auth if COREPACK_NPM_USERNAME and COREPACK_NPM_PASSWORD are set`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_NPM_USERNAME = `foo`;
    process.env.COREPACK_NPM_PASSWORD = `bar`;

    const encodedCreds = Buffer.from(`${process.env.COREPACK_NPM_USERNAME}:${process.env.COREPACK_NPM_PASSWORD}`, `utf8`).toString(`base64`);

    await fetchAsJson(`package-name`);

    expect(httpFetchAsJson).toBeCalled();
    expect(httpFetchAsJson).lastCalledWith(`${DEFAULT_NPM_REGISTRY_URL}/package-name`, {headers: {
      ...DEFAULT_HEADERS,
      authorization: `Basic ${encodedCreds}`,
    }});
  });

  it(`does not add authorization header if COREPACK_NPM_USERNAME is set and COREPACK_NPM_PASSWORD is not.`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_NPM_USERNAME = `foo`;

    await fetchAsJson(`package-name`);

    expect(httpFetchAsJson).toBeCalled();
    expect(httpFetchAsJson).lastCalledWith(`${DEFAULT_NPM_REGISTRY_URL}/package-name`, {headers: DEFAULT_HEADERS});
  });
});

// https://github.com/nodejs/corepack/issues/849
describe(`fetchLatestStableVersion`, () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(`raises an error pointing at the real env vars when integrity verification fails`, async () => {
    vi.mocked(httpFetchAsJson).mockResolvedValueOnce({
      version: `1.0.0`,
      dist: {
        integrity: `sha512-AAAA`,
        signatures: [],
        shasum: `abc`,
      },
    });

    let caught: Error | undefined;
    try {
      await fetchLatestStableVersion(`some-package`);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeInstanceOf(Error);
    // The error must steer users at the real env vars used by the runtime
    // - COREPACK_INTEGRITY_KEYS is read by shouldSkipIntegrityCheck()
    // - COREPACK_DEFAULT_TO_LATEST is read by the version-resolution path
    expect(caught!.message).toContain(`COREPACK_INTEGRITY_KEYS to 0`);
    expect(caught!.message).toContain(`COREPACK_DEFAULT_TO_LATEST to 0`);
    // Neither of these names exist anywhere else in the codebase, so the
    // error must not point users at them.
    expect(caught!.message).not.toContain(`COREPACK_INTEGRITY_CHECK`);
    expect(caught!.message).not.toContain(`COREPACK_USE_LATEST`);
    expect(caught!.message).toContain(`some-package`);
  });

  it(`skips signature verification and returns when COREPACK_INTEGRITY_KEYS=0`, async () => {
    process.env.COREPACK_INTEGRITY_KEYS = `0`;
    vi.mocked(httpFetchAsJson).mockResolvedValueOnce({
      version: `2.3.4`,
      dist: {
        integrity: `sha512-BBBB`,
        signatures: [],
        shasum: `def`,
      },
    });

    const out = await fetchLatestStableVersion(`some-package`);
    expect(out).toBe(`2.3.4+sha512.${Buffer.from(`BBBB`, `base64`).toString(`hex`)}`);
  });
});
