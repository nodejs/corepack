# Integrity checks

**An integrity failure can indicate that a package manager download or its
metadata has been tampered with, including by a man-in-the-middle attack.
Running a malicious package manager can compromise your project, credentials,
and machine. Investigate the failure before bypassing verification.**

Registry configuration problems, missing metadata, and signing key rotations
can also cause these errors. A failure alone does not prove an attack.

Corepack checks downloads of package managers such as npm, pnpm, and Yarn. These
checks do not verify your project's dependencies; those are downloaded and
managed by the package manager itself.

## What Corepack verifies

When a package manager version is pinned with a hash (for example in the
`packageManager` field of `package.json`), Corepack compares the downloaded file
against that hash.

For supported npm registry downloads without a pinned hash, Corepack verifies
the registry's signature against its trusted public keys, then compares the
download against the signed integrity hash. Corepack also verifies signatures
when resolving the latest stable version from an npm registry. The signed
message is `${packageName}@${version}:${dist.integrity}`.

Not every download supports registry signatures. See
[`COREPACK_ON_UNVERIFIED_DOWNLOAD`](./README.md#environment-variables) for options
to reject downloads that cannot be verified or that do not have a pinned hash.

## Troubleshooting

- **Missing or invalid `dist.signatures`:** Check that your registry or registry
  proxy preserves the upstream signing metadata. Corepack also looks for
  signatures in the package-root metadata when the per-version endpoint omits
  them. If your registry signs packages itself, configure its trusted public
  keys as described below. Adding keys cannot fix missing signatures.
- **Missing or invalid `dist.integrity`:** The registry must provide the
  SHA-512 integrity hash used to sign the package metadata. Ask the registry
  administrator to restore it.
- **Not signed by any trusted keys:** Verify which registry you are using
  (`COREPACK_NPM_REGISTRY`) and whether its signing keys have changed. For the
  public npm registry, update Corepack to a release with the current trusted
  keys. Check whether `COREPACK_INTEGRITY_KEYS` is overriding the bundled keys.
  For a custom registry, obtain the correct public keys from its administrator
  through a trusted channel.
- **Invalid `COREPACK_INTEGRITY_KEYS` or public key:** Check the JSON structure
  and public key encoding against the example below.
- **Cannot verify signature using trusted key:** Check that the public key type
  and signature format support SHA-256 signature verification.
- **Signature does not match:** The metadata does not match the signature made
  with the trusted key. Investigate the registry, proxy, and signing process;
  do not assume that downloading a new key or disabling verification is safe.
- **Mismatch hashes:** The downloaded file does not match the pinned or signed
  hash. Investigate possible corruption or tampering. Confirm the expected
  artifact with its publisher before changing a pinned hash.

If resolving the latest stable version fails, setting
`COREPACK_DEFAULT_TO_LATEST=0` uses the release already known to your Corepack
installation. It does not disable verification of subsequent downloads.

## Configuring trusted keys

By default, Corepack uses the keys in [`config.json`](./config.json). To override
them, set `COREPACK_INTEGRITY_KEYS` to a JSON object whose `npm` property is an
array of trusted public keys. This array **replaces** the bundled npm keys; it
does not add to them.

For example, in a POSIX shell, replace the placeholders with values obtained
through a trusted channel from your registry administrator:

```sh
export COREPACK_INTEGRITY_KEYS='{"npm":[{"keyid":"SHA256:<trusted-key-id>","key":"<base64-encoded-SPKI-public-key>"}]}'
```

- `keyid` must match the `keyid` in the registry's `dist.signatures` entries.
- `key` is the base64 encoding of the DER public key in SubjectPublicKeyInfo
  (SPKI) format, without PEM headers, footers, or line breaks. Use a public key,
  never a private key.
- Multiple keys can be included in the array, for example during a key rotation.

The npm registry's `/-/npm/v1/keys` endpoint returns an object with a `keys`
array. Corepack expects that array under `npm`, rather than the endpoint's entire
response. Authenticate any replacement keys independently; blindly trusting
keys returned alongside a failing download defeats signature verification.

Unset `COREPACK_INTEGRITY_KEYS` to restore the bundled trusted keys.

## Disabling signature verification

**Disabling verification can allow an attacker to substitute a malicious
package manager. Only bypass it if you have established the authenticity of
the download by another trusted means.**

To explicitly disable signature verification for one command in a POSIX shell,
set `COREPACK_INTEGRITY_KEYS` to an empty string:

```sh
COREPACK_INTEGRITY_KEYS='' corepack install --global pnpm
```

This skips registry signature verification and the protection provided by its
signed integrity hash. Explicitly pinned hashes are still checked. Avoid
persisting this setting in a shell profile or CI configuration; unset it to
restore verification. A hash obtained from the same untrusted source as the
download does not establish authenticity.
