import {UsageError}               from 'clipanion';
import {createVerify}             from 'crypto';

import defaultConfig              from '../config.json';

import {shouldSkipIntegrityCheck} from './corepackUtils';
import * as debugUtils            from './debugUtils';
import * as httpUtils             from './httpUtils';

// load abbreviated metadata as that's all we need for these calls
// see: https://github.com/npm/registry/blob/cfe04736f34db9274a780184d1cdb2fb3e4ead2a/docs/responses/package-metadata.md
export const DEFAULT_HEADERS: Record<string, string> = {
  [`Accept`]: `application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8`,
};
export const DEFAULT_NPM_REGISTRY_URL = `https://registry.npmjs.org`;

// Standard endpoint at which an npm registry publishes its signing keys.
// see: https://docs.npmjs.com/about-registry-signatures
const KEYS_ENDPOINT_PATH = `/-/npm/v1/keys`;

interface TrustedKey {
  keyid: string;
  key: string;
}

// A configured registry may carry a trailing slash, which would turn the keys
// path into `//-/npm/v1/keys`; not every registry resolves that to the same
// route, so it gets trimmed before the path is appended.
function trimTrailingSlashes(url: string) {
  return url.replace(/\/+$/, ``);
}

function getRegistryHeaders() {
  const headers = {...DEFAULT_HEADERS};

  if (`COREPACK_NPM_TOKEN` in process.env) {
    headers.authorization = `Bearer ${process.env.COREPACK_NPM_TOKEN}`;
  } else if (`COREPACK_NPM_USERNAME` in process.env
          && `COREPACK_NPM_PASSWORD` in process.env) {
    const encodedCreds = Buffer.from(`${process.env.COREPACK_NPM_USERNAME}:${process.env.COREPACK_NPM_PASSWORD}`, `utf8`).toString(`base64`);
    headers.authorization = `Basic ${encodedCreds}`;
  }

  return headers;
}

export async function fetchAsJson(packageName: string, version?: string) {
  const npmRegistryUrl = process.env.COREPACK_NPM_REGISTRY || DEFAULT_NPM_REGISTRY_URL;

  if (process.env.COREPACK_ENABLE_NETWORK === `0`)
    throw new UsageError(`Network access disabled by the environment; can't reach npm repository ${npmRegistryUrl}`);

  return httpUtils.fetchAsJson(`${npmRegistryUrl}/${packageName}${version ? `/${version}` : ``}`, {headers: getRegistryHeaders()});
}

const registryKeysCache = new Map<string, Promise<Array<TrustedKey> | null>>();

async function fetchRegistryKeys(registryUrl: string): Promise<Array<TrustedKey> | null> {
  const url = `${registryUrl}${KEYS_ENDPOINT_PATH}`;

  try {
    const data = await httpUtils.fetchAsJson(url, {headers: getRegistryHeaders()});

    // Only keep well-formed entries; anything else is unusable for verification.
    const keys = Array.isArray(data?.keys) ?
      (data.keys as Array<unknown>).filter((key): key is TrustedKey =>
        typeof (key as TrustedKey)?.keyid === `string` && typeof (key as TrustedKey)?.key === `string`) :
      [];

    if (!keys.length) {
      debugUtils.log(`No usable signing keys returned by ${url}`);
      return null;
    }

    return keys;
  } catch (error) {
    debugUtils.log(`Failed to fetch signing keys from ${url}: ${error}`);
    return null;
  }
}

function getRegistryKeys(registryUrl: string) {
  let keys = registryKeysCache.get(registryUrl);
  if (keys == null) {
    keys = fetchRegistryKeys(registryUrl);
    registryKeysCache.set(registryUrl, keys);
  }

  return keys;
}

function findTrustedSignature(signatures: Array<{keyid: string, sig: string}>, trustedKeys: Array<TrustedKey>) {
  let signature: typeof signatures[0] | undefined;
  let key!: string;
  for (const k of trustedKeys) {
    signature = signatures.find(({keyid}) => keyid === k.keyid);
    if (signature != null) {
      key = k.key;
      break;
    }
  }
  if (signature?.sig == null) return null;

  return {signature, key};
}

export async function verifySignature({signatures, integrity, packageName, version}: {
  signatures: Array<{keyid: string, sig: string}>;
  integrity: string;
  packageName: string;
  version: string;
}) {
  if (!Array.isArray(signatures) || !signatures.length) throw new Error(`No compatible signature found in package metadata`);

  const {npm: trustedKeys} = process.env.COREPACK_INTEGRITY_KEYS ?
    JSON.parse(process.env.COREPACK_INTEGRITY_KEYS) as {npm: Array<TrustedKey>} :
    defaultConfig.keys;

  let match = findTrustedSignature(signatures, trustedKeys);

  // The bundled keys only describe the public npm registry. When a custom
  // registry is configured, the package it serves may legitimately be signed by
  // that registry's own key (some registries re-sign what they serve), so fall
  // back to the keys it publishes rather than rejecting the package outright.
  // Those keys come from the very registry that serves the tarball we are about
  // to execute, so consulting them doesn't widen the trust boundary. An explicit
  // COREPACK_INTEGRITY_KEYS always wins, and the keys are only fetched when the
  // bundled ones don't already cover the signature.
  let registryKeys: Array<TrustedKey> | null = null;
  const customRegistryUrl = process.env.COREPACK_NPM_REGISTRY ?
    trimTrailingSlashes(process.env.COREPACK_NPM_REGISTRY) :
    undefined;
  if (match == null && !process.env.COREPACK_INTEGRITY_KEYS && customRegistryUrl && customRegistryUrl !== DEFAULT_NPM_REGISTRY_URL) {
    registryKeys = await getRegistryKeys(customRegistryUrl);
    if (registryKeys != null) {
      match = findTrustedSignature(signatures, registryKeys);
    }
  }

  if (match == null) {
    throw new UsageError(`The package was not signed by any trusted keys: ${JSON.stringify({
      signatures,
      trustedKeys: registryKeys == null ? trustedKeys : [...trustedKeys, ...registryKeys],
    }, undefined, 2)}`);
  }

  const verifier = createVerify(`SHA256`);
  verifier.end(`${packageName}@${version}:${integrity}`);
  const valid = verifier.verify(
    `-----BEGIN PUBLIC KEY-----\n${match.key}\n-----END PUBLIC KEY-----`,
    match.signature.sig,
    `base64`,
  );
  if (!valid) {
    throw new Error(`Signature does not match`);
  }
}

export async function fetchLatestStableVersion(packageName: string) {
  const metadata = await fetchAsJson(packageName, `latest`);

  const {version, dist: {integrity, signatures, shasum}} = metadata;

  if (!shouldSkipIntegrityCheck()) {
    try {
      await verifySignature({
        packageName, version,
        integrity, signatures,
      });
    } catch (cause) {
      // TODO: consider switching to `UsageError` when https://github.com/arcanis/clipanion/issues/157 is fixed
      throw new Error(`Corepack cannot download the latest stable version of ${packageName}; you can disable signature verification by setting COREPACK_INTEGRITY_CHECK to 0 in your env, or instruct Corepack to use the latest stable release known by this version of Corepack by setting COREPACK_USE_LATEST to 0`, {cause});
    }
  }

  return `${version}+${
    integrity ?
      `sha512.${Buffer.from(integrity.slice(7), `base64`).toString(`hex`)}` :
      `sha1.${shasum}`
  }`;
}

export async function fetchAvailableTags(packageName: string) {
  const metadata = await fetchAsJson(packageName);
  return metadata[`dist-tags`];
}

export async function fetchAvailableVersions(packageName: string) {
  const metadata = await fetchAsJson(packageName);
  return Object.keys(metadata.versions);
}

export async function fetchTarballURLAndSignature(packageName: string, version: string) {
  const versionMetadata = await fetchAsJson(packageName, version);
  const {tarball, signatures, integrity} = versionMetadata.dist;
  if (tarball === undefined || !tarball.startsWith(`http`))
    throw new Error(`${packageName}@${version} does not have a valid tarball.`);

  return {tarball, signatures, integrity};
}
