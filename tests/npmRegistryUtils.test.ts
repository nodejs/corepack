import {UsageError}                                             from 'clipanion';
import {Buffer}                                                 from 'node:buffer';
import {createSign, generateKeyPairSync}                        from 'node:crypto';
import process                                                  from 'node:process';
import {describe, beforeEach, it, expect, vi}                   from 'vitest';

import {fetchAsJson as httpFetchAsJson}                         from '../sources/httpUtils';
import {DEFAULT_HEADERS, DEFAULT_NPM_REGISTRY_URL}              from '../sources/npmRegistryUtils';
import {fetchLatestStableVersion, fetchAsJson, verifySignature} from '../sources/npmRegistryUtils';

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

  it(`does not produce a double slash when COREPACK_NPM_REGISTRY has a trailing slash`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_NPM_REGISTRY = `https://registry.example.org/`;
    await fetchAsJson(`package-name`);

    expect(httpFetchAsJson).toBeCalled();
    expect(httpFetchAsJson).lastCalledWith(`https://registry.example.org/package-name`, {headers: DEFAULT_HEADERS});
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
  const integrity = `sha512-abcdef`;
  const keyid = `SHA256:test-key`;

  let signatures: Array<{keyid: string, sig: string}>;

  beforeEach(() => {
    vi.resetAllMocks();

    const {publicKey, privateKey} = generateKeyPairSync(`ec`, {
      namedCurve: `prime256v1`,
      publicKeyEncoding: {type: `spki`, format: `der`},
      privateKeyEncoding: {type: `pkcs8`, format: `pem`},
    });

    const signer = createSign(`SHA256`);
    signer.end(`${packageName}@${version}:${integrity}`);
    signatures = [{keyid, sig: signer.sign(privateKey, `base64`)}];

    process.env.COREPACK_INTEGRITY_KEYS = JSON.stringify({npm: [{keyid, key: publicKey.toString(`base64`)}]});
  });

  it(`verifies using the version endpoint's signatures without a fallback fetch`, async () => {
    await expect(verifySignature({signatures, integrity, packageName, version})).resolves.toBeUndefined();

    expect(httpFetchAsJson).not.toBeCalled();
  });

  it(`falls back to the package-root endpoint when signatures are missing on the version endpoint`, async () => {
    vi.mocked(httpFetchAsJson).mockResolvedValue({
      versions: {
        [version]: {dist: {signatures}},
      },
    });

    await expect(verifySignature({signatures: [], integrity, packageName, version})).resolves.toBeUndefined();

    expect(httpFetchAsJson).toBeCalledTimes(1);
    expect(httpFetchAsJson).lastCalledWith(`${DEFAULT_NPM_REGISTRY_URL}/${packageName}`, {headers: DEFAULT_HEADERS});
  });

  it(`throws when signatures are missing on both the version and package-root endpoints`, async () => {
    vi.mocked(httpFetchAsJson).mockResolvedValue({
      versions: {
        [version]: {dist: {}},
      },
    });

    await expect(verifySignature({signatures: [], integrity, packageName, version})).rejects.toThrowError(`No compatible signature found in package metadata`);
  });

  it.each([undefined, null, [], {}])(`explains missing signatures (%j)`, async signatures => {
    vi.mocked(httpFetchAsJson).mockResolvedValue({versions: {[version]: {dist: {}}}});

    await expect(verifySignature({signatures, integrity, packageName, version})).rejects.toMatchObject({
      name: `UsageError`,
      message: expect.stringContaining(`dist.signatures`),
    });
  });

  it.each([[null], [{}], [{keyid}], [{keyid, sig: 42}], [{keyid, sig: ``}]])(`explains malformed signatures (%j)`, async entry => {
    await expect(verifySignature({signatures: [entry], integrity, packageName, version})).rejects.toMatchObject({
      name: `UsageError`,
      message: expect.stringContaining(`Invalid dist.signatures`),
    });
  });

  it.each([undefined, null, 42, ``, `sha512-`, `sha1-abcdef`])(`explains missing or invalid integrity (%j)`, async integrity => {
    await expect(verifySignature({signatures, integrity, packageName, version})).rejects.toMatchObject({
      name: `UsageError`,
      message: expect.stringContaining(`dist.integrity`),
    });
  });

  it.each([
    `invalid json`, `false`, `null`, `[]`, `{}`, `{"npm":{}}`, `{"npm":[null]}`,
    JSON.stringify({npm: [{keyid}]}),
    JSON.stringify({npm: [{keyid, key: 42}]}),
  ])(`explains invalid trusted key configuration (%s)`, async keys => {
    process.env.COREPACK_INTEGRITY_KEYS = keys;

    await expect(verifySignature({signatures, integrity, packageName, version})).rejects.toMatchObject({
      name: `UsageError`,
      message: expect.stringContaining(`Invalid COREPACK_INTEGRITY_KEYS`),
    });
  });

  it(`explains invalid public key encoding`, async () => {
    process.env.COREPACK_INTEGRITY_KEYS = JSON.stringify({npm: [{keyid, key: `invalid-public-key`}]});

    await expect(verifySignature({signatures, integrity, packageName, version})).rejects.toMatchObject({
      name: `UsageError`,
      message: expect.stringContaining(`Invalid public key for ${keyid}`),
    });
  });

  it(`explains a public key that cannot be used to verify signatures`, async () => {
    const {publicKey} = generateKeyPairSync(`x25519`, {
      publicKeyEncoding: {type: `spki`, format: `der`},
      privateKeyEncoding: {type: `pkcs8`, format: `pem`},
    });
    process.env.COREPACK_INTEGRITY_KEYS = JSON.stringify({npm: [{keyid, key: publicKey.toString(`base64`)}]});

    await expect(verifySignature({signatures, integrity, packageName, version})).rejects.toMatchObject({
      name: `UsageError`,
      message: expect.stringContaining(`Cannot verify signature using trusted key ${keyid}`),
    });
  });

  it(`identifies the package and links to the integrity guide when no trusted key matches`, async () => {
    signatures[0].keyid = `SHA256:untrusted-key`;

    const error = await verifySignature({signatures, integrity, packageName, version}).catch(error => error);
    expect(error).toBeInstanceOf(UsageError);
    expect(error.message).toContain(`not signed by any trusted keys`);
    expect(error.message).toContain(`${packageName}@${version}`);
    expect(error.message).toContain(`COREPACK_INTEGRITY_KEYS`);
    expect(error.message).toContain(`https://github.com/nodejs/corepack/blob/main/INTEGRITY.md`);
  });

  it(`rejects a signature that does not match the package metadata`, async () => {
    await expect(verifySignature({signatures, integrity, packageName, version: `2.0.0`})).rejects.toMatchObject({
      name: `UsageError`,
      message: expect.stringContaining(`Signature does not match`),
    });
  });
});

// https://github.com/nodejs/corepack/issues/849
describe(`fetchLatestStableVersion`, () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(`preserves the verification error and points to troubleshooting when fetching latest fails`, async () => {
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
    expect(caught).toBeInstanceOf(UsageError);
    expect(caught!.message).toContain(`No compatible signature found`);
    expect(caught!.message).toContain(`https://github.com/nodejs/corepack/blob/main/INTEGRITY.md`);
    expect(caught!.message).toContain(`COREPACK_DEFAULT_TO_LATEST to 0`);
    expect(caught!.message).not.toContain(`disable signature verification`);
    // Neither of these names exist anywhere else in the codebase, so the
    // error must not point users at them.
    expect(caught!.message).not.toContain(`COREPACK_INTEGRITY_CHECK`);
    expect(caught!.message).not.toContain(`COREPACK_USE_LATEST`);
    expect(caught!.message).toContain(`some-package`);
  });

  it.each([``, `0`])(`skips signature verification and returns when COREPACK_INTEGRITY_KEYS=%j`, async value => {
    process.env.COREPACK_INTEGRITY_KEYS = value;
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
