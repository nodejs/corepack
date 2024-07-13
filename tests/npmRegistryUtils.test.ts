import {jest, describe, beforeEach, it, expect}                 from '@jest/globals';
import {Buffer}                                                 from 'node:buffer';
import process                                                  from 'node:process';

import {fetchAsJson as httpFetchAsJson}                         from '../sources/httpUtils';
import {DEFAULT_HEADERS, DEFAULT_NPM_REGISTRY_URL, fetchAsJson} from '../sources/npmRegistryUtils';

// jest.mock(`../sources/httpUtils`);

describe(`npm registry utils fetchAsJson`, () => {
  beforeEach(() => {
    jest.resetAllMocks();

    globalThis.fetch = jest.fn(() => Promise.resolve( {
      ok: true,
      json: () => Promise.resolve({})
    }));

  });

  it(`throw usage error if COREPACK_ENABLE_NETWORK env is set to 0`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_ENABLE_NETWORK = `0`;

    await expect(fetchAsJson(`package-name`)).rejects.toThrowError();
  });

  it(`loads from DEFAULT_NPM_REGISTRY_URL by default`, async () => {
    await fetchAsJson(`package-name`);

    expect(globalThis.fetch).toBeCalled();
    expect(globalThis.fetch).lastCalledWith(new URL(`${DEFAULT_NPM_REGISTRY_URL}/package-name`), {headers: DEFAULT_HEADERS});
  });

  it(`loads from custom COREPACK_NPM_REGISTRY if set`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_NPM_REGISTRY = `https://registry.example.org`;
    await fetchAsJson(`package-name`);

    expect(globalThis.fetch).toBeCalled();
    expect(globalThis.fetch).lastCalledWith(new URL(`${process.env.COREPACK_NPM_REGISTRY}/package-name`), {headers: DEFAULT_HEADERS});
  });

  it(`adds authorization header with bearer token if COREPACK_NPM_TOKEN is set`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_NPM_TOKEN = `foo`;

    await fetchAsJson(`package-name`);

    expect(globalThis.fetch).toBeCalled();
    expect(globalThis.fetch).lastCalledWith(new URL(`${DEFAULT_NPM_REGISTRY_URL}/package-name`), {headers: {
      ...DEFAULT_HEADERS,
      authorization: `Bearer ${process.env.COREPACK_NPM_TOKEN}`,
    }});
  });

  it(`prioritize COREPACK_NPM_TOKEN over COREPACK_NPM_USERNAME and COREPACK_NPM_PASSWORD`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_NPM_TOKEN = `foo`;
    process.env.COREPACK_NPM_USERNAME = `bar`;
    process.env.COREPACK_NPM_PASSWORD = `foobar`;

    await fetchAsJson(`package-name`);

    expect(globalThis.fetch).toBeCalled();
    expect(globalThis.fetch).lastCalledWith(new URL(`${DEFAULT_NPM_REGISTRY_URL}/package-name`), {headers: {
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

    expect(globalThis.fetch).toBeCalled();
    expect(globalThis.fetch).lastCalledWith(new URL(`${DEFAULT_NPM_REGISTRY_URL}/package-name`), {headers: {
      ...DEFAULT_HEADERS,
      authorization: `Basic ${encodedCreds}`,
    }});
  });

  it(`does not add authorization header if COREPACK_NPM_USERNAME is set and COREPACK_NPM_PASSWORD is not.`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_NPM_USERNAME = `foo`;

    await fetchAsJson(`package-name`);

    expect(globalThis.fetch).toBeCalled();
    expect(globalThis.fetch).lastCalledWith(new URL(`${DEFAULT_NPM_REGISTRY_URL}/package-name`), {headers: DEFAULT_HEADERS});
  });
});
