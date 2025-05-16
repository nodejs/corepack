import * as sigstoreTuf           from '@sigstore/tuf';
import {UsageError}               from 'clipanion';
import assert                     from 'node:assert';
import * as crypto                from 'node:crypto';
import * as path                  from 'node:path';

import defaultConfig              from '../config.json';

import {shouldSkipIntegrityCheck} from './corepackUtils';
import * as debugUtils            from './debugUtils';
import * as folderUtils           from './folderUtils';
import * as httpUtils             from './httpUtils';

// load abbreviated metadata as that's all we need for these calls
// see: https://github.com/npm/registry/blob/cfe04736f34db9274a780184d1cdb2fb3e4ead2a/docs/responses/package-metadata.md
export const DEFAULT_HEADERS: Record<string, string> = {
  [`Accept`]: `application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8`,
};
export const DEFAULT_NPM_REGISTRY_URL = `https://registry.npmjs.org`;

export async function fetchAsJson(packageName: string, version?: string) {
  const npmRegistryUrl = process.env.COREPACK_NPM_REGISTRY || DEFAULT_NPM_REGISTRY_URL;

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

interface KeyInfo {
  keyid: string;
  // base64 encoded DER SPKI
  keyData: string;
}

async function fetchSigstoreTufKeys(): Promise<Array<KeyInfo> | null> {
  // This follows the implementation for npm.
  // See https://github.com/npm/cli/blob/3a80a7b7d168c23b5e297cba7b47ba5b9875934d/lib/utils/verify-signatures.js#L174
  let keysRaw: string;
  try {
    // @ts-expect-error inject custom fetch into monkey-patched `tuf-js` module.
    globalThis.tufJsFetch = async (input: string) => {
      const agent = await httpUtils.getProxyAgent(input);
      return await globalThis.fetch(input, {
        dispatcher: agent,
      });
    };
    const sigstoreTufClient = await sigstoreTuf.initTUF({
      cachePath: path.join(folderUtils.getCorepackHomeFolder(), `_tuf`),
    });
    keysRaw = await sigstoreTufClient.getTarget(`registry.npmjs.org/keys.json`);
  } catch (error) {
    console.warn(`Warning: Failed to get signing keys from Sigstore TUF repo`, error);
    return null;
  }

  // The format of the key file is undocumented but follows `PublicKey` from
  // sigstore/protobuf-specs.
  // See https://github.com/sigstore/protobuf-specs/blob/main/gen/pb-typescript/src/__generated__/sigstore_common.ts
  const keysFromSigstore = JSON.parse(keysRaw) as {keys: Array<{keyId: string, publicKey: {rawBytes: string, keyDetails: string}}>};

  return keysFromSigstore.keys.filter(key => {
    if (key.publicKey.keyDetails === `PKIX_ECDSA_P256_SHA_256`) {
      return true;
    } else {
      debugUtils.log(`Unsupported verification key type ${key.publicKey.keyDetails}`);
      return false;
    }
  }).map(k => ({
    keyid: k.keyId,
    keyData: k.publicKey.rawBytes,
  }));
}

async function getVerificationKeys(): Promise<Array<KeyInfo>> {
  let keys: Array<{keyid: string, key: string}>;

  if (process.env.COREPACK_INTEGRITY_KEYS) {
    // We use the format of the `GET /-/npm/v1/keys` endpoint with `npm` instead
    // of `keys` as the wrapping key.
    const keysFromEnv = JSON.parse(process.env.COREPACK_INTEGRITY_KEYS) as {npm: Array<{keyid: string, key: string}>};
    keys = keysFromEnv.npm;
    debugUtils.log(`Using COREPACK_INTEGRITY_KEYS to verify signatures: ${keys.map(k => k.keyid).join(`, `)}`);
    return keys.map(k => ({
      keyid: k.keyid,
      keyData: k.key,
    }));
  }


  const sigstoreKeys = await fetchSigstoreTufKeys();
  if (sigstoreKeys) {
    debugUtils.log(`Using NPM keys from @sigstore/tuf to verify signatures: ${sigstoreKeys.map(k => k.keyid).join(`, `)}`);
    return sigstoreKeys;
  }

  debugUtils.log(`Falling back to built-in npm verification keys`);
  return defaultConfig.keys.npm.map(k => ({
    keyid: k.keyid,
    keyData: k.key,
  }));
}

let verificationKeysCache: Promise<Array<KeyInfo>> | null = null;

export async function verifySignature({signatures, integrity, packageName, version}: {
  signatures: Array<{keyid: string, sig: string}>;
  integrity: string;
  packageName: string;
  version: string;
}) {
  if (!Array.isArray(signatures) || !signatures.length) throw new Error(`No compatible signature found in package metadata`);

  if (!verificationKeysCache)
    verificationKeysCache = getVerificationKeys();

  const keys = await verificationKeysCache;
  const keyInfo = keys.find(({keyid}) => signatures.some(s => s.keyid === keyid));
  if (keyInfo == null)
    throw new Error(`Cannot find key to verify signature. signature keys: ${signatures.map(s => s.keyid)}, verification keys: ${keys.map(k => k.keyid)}`);

  const signature = signatures.find(({keyid}) => keyid === keyInfo.keyid);
  assert(signature);

  const verifier = crypto.createVerify(`SHA256`);
  const payload = `${packageName}@${version}:${integrity}`;
  verifier.end(payload);
  const key = crypto.createPublicKey({key: Buffer.from(keyInfo.keyData, `base64`), format: `der`, type: `spki`});
  const valid = verifier.verify(key, signature.sig, `base64`);

  if (!valid) {
    throw new Error(
      `Signature verification failed for ${payload} with key ${keyInfo.keyid}\n` +
      `If you are using a custom registry you can set COREPACK_INTEGRITY_KEYS.`,
    );
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
