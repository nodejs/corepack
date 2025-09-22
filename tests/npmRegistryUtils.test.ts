import {Buffer}                                                 from 'node:buffer';
import process                                                  from 'node:process';
import {describe, beforeEach, it, expect, vi}                   from 'vitest';

import {fetchAsJson as httpFetchAsJson}                         from '../sources/httpUtils';
import {DEFAULT_HEADERS, DEFAULT_NPM_REGISTRY_URL, fetchAsJson} from '../sources/npmRegistryUtils';

const fetchMock = vi.fn(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({}),
}));
vi.stubGlobal(`fetch`, fetchMock);

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

    expect(fetchMock).toBeCalled();
    expect(fetchMock).lastCalledWith(new URL(`${DEFAULT_NPM_REGISTRY_URL}/package-name`), expect.objectContaining({headers: DEFAULT_HEADERS}));
  });

  it(`loads from custom COREPACK_NPM_REGISTRY if set`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_NPM_REGISTRY = `https://registry.example.org`;
    await fetchAsJson(`package-name`);

    expect(fetchMock).toBeCalled();
    expect(fetchMock).lastCalledWith(new URL(`${process.env.COREPACK_NPM_REGISTRY}/package-name`), expect.objectContaining({headers: DEFAULT_HEADERS}));
  });

  it(`adds authorization header with bearer token if COREPACK_NPM_TOKEN is set`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_NPM_TOKEN = `foo`;

    await fetchAsJson(`package-name`);

    expect(fetchMock).toBeCalled();
    expect(fetchMock).lastCalledWith(new URL(`${DEFAULT_NPM_REGISTRY_URL}/package-name`), expect.objectContaining({
      headers: {
        ...DEFAULT_HEADERS,
        authorization: `Bearer ${process.env.COREPACK_NPM_TOKEN}`,
      },
    }));
  });

  it(`only adds authorization header with bearer token if COREPACK_NPM_TOKEN and COREPACK_NPM_USERNAME are set`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_NPM_TOKEN = `foo`;
    process.env.COREPACK_NPM_USERNAME = `bar`;
    process.env.COREPACK_NPM_PASSWORD = `foobar`;

    await fetchAsJson(`package-name`);

    expect(fetchMock).toBeCalled();
    expect(fetchMock).lastCalledWith(new URL(`${DEFAULT_NPM_REGISTRY_URL}/package-name`), expect.objectContaining({
      headers: {
        ...DEFAULT_HEADERS,
        authorization: `Bearer foo`,
      },
    }));
  });


  it(`adds authorization header with basic auth if COREPACK_NPM_USERNAME and COREPACK_NPM_PASSWORD are set`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_NPM_USERNAME = `foo`;
    process.env.COREPACK_NPM_PASSWORD = `bar`;

    const encodedCreds = Buffer.from(`${process.env.COREPACK_NPM_USERNAME}:${process.env.COREPACK_NPM_PASSWORD}`, `utf8`).toString(`base64`);

    await fetchAsJson(`package-name`);

    expect(fetchMock).toBeCalled();
    expect(fetchMock).lastCalledWith(new URL(`${DEFAULT_NPM_REGISTRY_URL}/package-name`), expect.objectContaining({
      headers: {
        ...DEFAULT_HEADERS,
        authorization: `Basic ${encodedCreds}`,
      },
    }));
  });

  it(`adds authorization header if COREPACK_NPM_USERNAME is set and COREPACK_NPM_PASSWORD is not.`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_NPM_USERNAME = `foo`;

    const encodedCreds = Buffer.from(`${process.env.COREPACK_NPM_USERNAME}:`, `utf8`).toString(`base64`);

    await fetchAsJson(`package-name`);

    expect(fetchMock).toBeCalled();
    expect(fetchMock).lastCalledWith(new URL(`${DEFAULT_NPM_REGISTRY_URL}/package-name`), expect.objectContaining({
      headers: {
        ...DEFAULT_HEADERS,
        authorization: `Basic ${encodedCreds}`
    }));
  });

  it(`adds authorization header if COREPACK_NPM_PASSWORD is set and COREPACK_NPM_USERNAME is not.`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_NPM_PASSWORD = `foo`;

    const encodedCreds = Buffer.from(`:${process.env.COREPACK_NPM_PASSWORD}`, `utf8`).toString(`base64`);

    await fetchAsJson(`package-name`);

    expect(fetchMock).toBeCalled();
    expect(fetchMock).lastCalledWith(new URL(`${DEFAULT_NPM_REGISTRY_URL}/package-name`), expect.objectContaining({
      headers: {
        ...DEFAULT_HEADERS,
        authorization: `Basic ${encodedCreds}`
    }));
  });

  it(`does add authorization header if registry url contains a path`, async () => {
    process.env.COREPACK_NPM_REGISTRY = `https://registry.example.org/some/path`;
    process.env.COREPACK_NPM_TOKEN = `foo`;

    await fetchAsJson(`package-name`);

    expect(fetchMock).toBeCalled();
    expect(fetchMock).lastCalledWith(new URL(`https://registry.example.org/some/path/package-name`), expect.objectContaining({
      headers: {
        ...DEFAULT_HEADERS,
        authorization: `Bearer foo`,
      },
    }));
  });
});

describe(`httpUtils fetchAsJson`, () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(`does not add authorization header if the origin is different from the registry origin`, async () => {
    process.env.COREPACK_NPM_REGISTRY = `https://registry.example.org/some/path`;
    process.env.COREPACK_NPM_TOKEN = `foo`;

    await httpFetchAsJson(`https://another-registry.example.org/package-name`);

    expect(fetchMock).toBeCalled();
    expect(fetchMock).lastCalledWith(new URL(`https://another-registry.example.org/package-name`), expect.objectContaining({
      headers: undefined,
    }));
  });
});
