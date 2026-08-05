import {Buffer}                                                                  from 'node:buffer';
import {createHash, createSign, generateKeyPairSync}                             from 'node:crypto';
import process                                                                   from 'node:process';
import {describe, beforeEach, it, expect, vi}                                    from 'vitest';

import {fetchAsJson as httpFetchAsJson}                                          from '../sources/httpUtils';
import {DEFAULT_HEADERS, DEFAULT_NPM_REGISTRY_URL, fetchAsJson, verifySignature} from '../sources/npmRegistryUtils';

vi.mock(`../sources/httpUtils`);

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

describe(`npm registry utils verifySignature`, () => {
  const packageName = `package-name`;
  const version = `1.0.0`;
  const KEYS_PATH = `/-/npm/v1/keys`;

  // Fetched keys are cached per registry for the lifetime of the process, so
  // every test needs its own registry URL to stay independent.
  let registryCount = 0;
  function uniqueRegistryUrl() {
    return `https://registry-${++registryCount}.example.org`;
  }

  function signPackage() {
    const integrity = `sha512-${Buffer.from(`${packageName}@${version}`).toString(`base64`)}`;
    const {privateKey, publicKey} = generateKeyPairSync(`ec`, {
      namedCurve: `prime256v1`,
      publicKeyEncoding: {type: `spki`, format: `pem`},
      privateKeyEncoding: {type: `pkcs8`, format: `pem`},
    });
    const keyid = `SHA256:${createHash(`SHA256`).end(publicKey).digest(`base64`)}`;
    const sig = createSign(`SHA256`).end(`${packageName}@${version}:${integrity}`).sign(privateKey, `base64`);

    return {
      integrity,
      signatures: [{keyid, sig}],
      publishedKey: {
        expires: null,
        keyid,
        keytype: `ecdsa-sha2-nistp256`,
        scheme: `ecdsa-sha2-nistp256`,
        key: publicKey.split(`\n`).slice(1, -2).join(``),
      },
    };
  }

  function mockKeysEndpoint(payload: any) {
    vi.mocked(httpFetchAsJson).mockImplementation(async (input: string | URL) => {
      if (`${input}`.endsWith(KEYS_PATH)) return payload;
      throw new Error(`Unexpected request to ${input}`);
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(`verifies a signature made with a key published by the custom registry`, async () => {
    const {integrity, signatures, publishedKey} = signPackage();
    const registryUrl = uniqueRegistryUrl();
    process.env.COREPACK_NPM_REGISTRY = registryUrl;
    mockKeysEndpoint({keys: [publishedKey]});

    await expect(verifySignature({signatures, integrity, packageName, version})).resolves.toBeUndefined();

    expect(httpFetchAsJson).lastCalledWith(`${registryUrl}${KEYS_PATH}`, {headers: DEFAULT_HEADERS});
  });

  it(`does not double the slash when the configured registry ends with one`, async () => {
    const {integrity, signatures, publishedKey} = signPackage();
    const registryUrl = uniqueRegistryUrl();
    process.env.COREPACK_NPM_REGISTRY = `${registryUrl}/`;
    mockKeysEndpoint({keys: [publishedKey]});

    await expect(verifySignature({signatures, integrity, packageName, version})).resolves.toBeUndefined();

    expect(httpFetchAsJson).lastCalledWith(`${registryUrl}${KEYS_PATH}`, {headers: DEFAULT_HEADERS});
  });

  it(`does not fetch the published keys when the default registry is set explicitly with a trailing slash`, async () => {
    const {integrity, signatures} = signPackage();
    process.env.COREPACK_NPM_REGISTRY = `${DEFAULT_NPM_REGISTRY_URL}/`;

    await expect(verifySignature({signatures, integrity, packageName, version})).rejects.toThrowError(/not signed by any trusted keys/);

    expect(httpFetchAsJson).not.toBeCalled();
  });

  it(`sends the registry credentials when fetching the keys`, async () => {
    const {integrity, signatures, publishedKey} = signPackage();
    const registryUrl = uniqueRegistryUrl();
    process.env.COREPACK_NPM_REGISTRY = registryUrl;
    process.env.COREPACK_NPM_TOKEN = `foo`;
    mockKeysEndpoint({keys: [publishedKey]});

    await verifySignature({signatures, integrity, packageName, version});

    expect(httpFetchAsJson).lastCalledWith(`${registryUrl}${KEYS_PATH}`, {headers: {
      ...DEFAULT_HEADERS,
      authorization: `Bearer foo`,
    }});
  });

  it(`ignores malformed entries in the published keys`, async () => {
    const {integrity, signatures, publishedKey} = signPackage();
    process.env.COREPACK_NPM_REGISTRY = uniqueRegistryUrl();
    mockKeysEndpoint({keys: [`invalid`, {keyid: `SHA256:no-key`}, publishedKey]});

    await expect(verifySignature({signatures, integrity, packageName, version})).resolves.toBeUndefined();
  });

  it(`only fetches the published keys once per registry`, async () => {
    const {integrity, signatures, publishedKey} = signPackage();
    process.env.COREPACK_NPM_REGISTRY = uniqueRegistryUrl();
    mockKeysEndpoint({keys: [publishedKey]});

    await verifySignature({signatures, integrity, packageName, version});
    await verifySignature({signatures, integrity, packageName, version});

    expect(httpFetchAsJson).toHaveBeenCalledTimes(1);
  });

  it(`does not fetch the published keys when no custom registry is configured`, async () => {
    const {integrity, signatures} = signPackage();

    await expect(verifySignature({signatures, integrity, packageName, version})).rejects.toThrowError(/not signed by any trusted keys/);

    expect(httpFetchAsJson).not.toBeCalled();
  });

  it(`does not fetch the published keys when COREPACK_INTEGRITY_KEYS is set`, async () => {
    const {integrity, signatures, publishedKey} = signPackage();
    process.env.COREPACK_NPM_REGISTRY = uniqueRegistryUrl();
    process.env.COREPACK_INTEGRITY_KEYS = JSON.stringify({npm: [{keyid: `SHA256:other`, key: `other`}]});
    mockKeysEndpoint({keys: [publishedKey]});

    await expect(verifySignature({signatures, integrity, packageName, version})).rejects.toThrowError(/not signed by any trusted keys/);

    expect(httpFetchAsJson).not.toBeCalled();
  });

  it(`does not fetch the published keys when the bundled keys already cover the signature`, async () => {
    const {integrity, signatures, publishedKey} = signPackage();
    process.env.COREPACK_NPM_REGISTRY = uniqueRegistryUrl();
    process.env.COREPACK_INTEGRITY_KEYS = JSON.stringify({npm: [publishedKey]});
    mockKeysEndpoint({keys: []});

    await expect(verifySignature({signatures, integrity, packageName, version})).resolves.toBeUndefined();

    expect(httpFetchAsJson).not.toBeCalled();
  });

  it(`throws the usual error when the keys endpoint is unreachable`, async () => {
    const {integrity, signatures} = signPackage();
    process.env.COREPACK_NPM_REGISTRY = uniqueRegistryUrl();
    vi.mocked(httpFetchAsJson).mockRejectedValue(new Error(`HTTP 404`));

    await expect(verifySignature({signatures, integrity, packageName, version})).rejects.toThrowError(/not signed by any trusted keys/);
  });

  it(`throws the usual error when the registry publishes no usable keys`, async () => {
    const {integrity, signatures} = signPackage();
    process.env.COREPACK_NPM_REGISTRY = uniqueRegistryUrl();
    mockKeysEndpoint({keys: []});

    await expect(verifySignature({signatures, integrity, packageName, version})).rejects.toThrowError(/not signed by any trusted keys/);
  });

  it(`throws when the signature does not match the published key`, async () => {
    const {integrity, signatures} = signPackage();
    const {publishedKey: otherKey} = signPackage();
    process.env.COREPACK_NPM_REGISTRY = uniqueRegistryUrl();
    // Same keyid as the signature, but a key the signature was not made with.
    mockKeysEndpoint({keys: [{...otherKey, keyid: signatures[0].keyid}]});

    await expect(verifySignature({signatures, integrity, packageName, version})).rejects.toThrowError(/Signature does not match/);
  });
});
