import {UsageError}                    from 'clipanion';
import {createPublicKey, createVerify} from 'crypto';

import defaultConfig                   from '../config.json' with {type: 'json'};

import {shouldSkipIntegrityCheck}      from './corepackUtils.ts';
import * as httpUtils                  from './httpUtils.ts';

// load abbreviated metadata as that's all we need for these calls
// see: https://github.com/npm/registry/blob/cfe04736f34db9274a780184d1cdb2fb3e4ead2a/docs/responses/package-metadata.md
export const DEFAULT_HEADERS: Record<string, string> = {
  [`Accept`]: `application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8`,
};
export const DEFAULT_NPM_REGISTRY_URL = `https://registry.npmjs.org`;
export const INTEGRITY_KEYS_URL = `https://github.com/nodejs/corepack/blob/main/INTEGRITY.md`;

export async function fetchAsJson(packageName: string, version?: string) {
  // Strip any trailing slashes so a `COREPACK_NPM_REGISTRY` with a trailing
  // slash does not produce a double slash in the request URL (some registries,
  // e.g. registry.npmmirror.com, reject `//package` with a 404).
  const npmRegistryUrl = (process.env.COREPACK_NPM_REGISTRY || DEFAULT_NPM_REGISTRY_URL).replace(/\/+$/, ``);

  if (process.env.COREPACK_ENABLE_NETWORK === `0`)
    throw new UsageError(`Network access disabled by the environment; can't reach npm repository ${npmRegistryUrl}`);

  const headers = {...DEFAULT_HEADERS};

  if (`COREPACK_NPM_TOKEN` in process.env) {
    headers.authorization = `Bearer ${process.env.COREPACK_NPM_TOKEN}`;
  } else if (`COREPACK_NPM_USERNAME` in process.env
          && `COREPACK_NPM_PASSWORD` in process.env) {
    const encodedCreds = Buffer.from(`${process.env.COREPACK_NPM_USERNAME}:${process.env.COREPACK_NPM_PASSWORD}`, `utf8`).toString(`base64`);
    headers.authorization = `Basic ${encodedCreds}`;
  }

  return httpUtils.fetchAsJson(`${npmRegistryUrl}/${packageName}${version ? `/${version}` : ``}`, {headers});
}

export async function verifySignature({signatures, integrity, packageName, version}: {
  signatures: unknown;
  integrity: unknown;
  packageName: string;
  version: string;
}) {
  const integrityError = (message: string) => new UsageError(`${message} (${packageName}@${version}). See ${INTEGRITY_KEYS_URL} for troubleshooting.`);

  if (!Array.isArray(signatures) || !signatures.length) {
    // Some registry proxies omit `dist.signatures` on the per-version endpoint but keep it on the package root.
    const rootMetadata = await fetchAsJson(packageName);
    signatures = rootMetadata?.versions?.[version]?.dist?.signatures;
  }

  if (!Array.isArray(signatures) || !signatures.length)
    throw integrityError(`No compatible signature found in package metadata; the registry must provide dist.signatures`);

  if (signatures.some(s => typeof s?.keyid !== `string` || !s.keyid || typeof s?.sig !== `string` || !s.sig))
    throw integrityError(`Invalid dist.signatures in package metadata; each signature must contain non-empty keyid and sig strings`);

  if (typeof integrity !== `string` || !integrity.startsWith(`sha512-`) || integrity.length === `sha512-`.length)
    throw integrityError(`Missing or invalid dist.integrity in package metadata; the registry must provide a SHA-512 integrity hash`);

  let trustedKeys: typeof defaultConfig.keys.npm;
  try {
    const keys = process.env.COREPACK_INTEGRITY_KEYS ? JSON.parse(process.env.COREPACK_INTEGRITY_KEYS) : defaultConfig.keys;
    if (!Array.isArray(keys?.npm) || keys.npm.some((k: any) => typeof k?.keyid !== `string` || !k.keyid || typeof k?.key !== `string` || !k.key))
      throw new Error(`Invalid trusted keys`);
    trustedKeys = keys.npm;
  } catch {
    throw integrityError(`Invalid COREPACK_INTEGRITY_KEYS; expected a JSON object with an npm array of trusted keys containing non-empty keyid and key strings`);
  }

  let signature: typeof signatures[0] | undefined;
  let key!: string;
  for (const k of trustedKeys) {
    signature = signatures.find(({keyid}) => keyid === k.keyid);
    if (signature != null) {
      key = k.key;
      break;
    }
  }
  if (signature == null)
    throw integrityError(`The package was not signed by any trusted keys; check the registry's signing keys and COREPACK_INTEGRITY_KEYS`);

  let publicKey;
  try {
    publicKey = createPublicKey(`-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`);
  } catch {
    throw integrityError(`Invalid public key for ${signature.keyid}; COREPACK_INTEGRITY_KEYS must contain base64-encoded DER public keys in SubjectPublicKeyInfo format`);
  }

  const verifier = createVerify(`SHA256`);
  verifier.end(`${packageName}@${version}:${integrity}`);
  let valid;
  try {
    valid = verifier.verify(publicKey, signature.sig, `base64`);
  } catch {
    throw integrityError(`Cannot verify signature using trusted key ${signature.keyid}; check the public key and signature format`);
  }
  if (!valid) {
    throw integrityError(`Signature does not match; the package metadata may have been tampered with`);
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
      throw new UsageError(`Corepack cannot download the latest stable version of ${packageName}: ${cause instanceof Error ? cause.message : String(cause)}\nYou can use the latest stable release known by this version of Corepack by setting COREPACK_DEFAULT_TO_LATEST to 0. For integrity key configuration, see ${INTEGRITY_KEYS_URL}.`);
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
