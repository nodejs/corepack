import {UsageError}          from 'clipanion';
import {OutgoingHttpHeaders} from 'http2';

import * as httpUtils        from './httpUtils';

// load abbreviated metadata as that's all we need for these calls
// see: https://github.com/npm/registry/blob/cfe04736f34db9274a780184d1cdb2fb3e4ead2a/docs/responses/package-metadata.md
export const DEFAULT_HEADERS: OutgoingHttpHeaders = {
  [`Accept`]: `application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8`,
};
export const DEFAULT_NPM_REGISTRY_URL = `https://registry.npmjs.org`;

export async function fetchAsJson(packageName: string) {
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

  return httpUtils.fetchAsJson(`${npmRegistryUrl}/${packageName}`, {headers});
}

export async function fetchLatestStableVersion(packageName: string) {
  const metadata = await fetchAsJson(packageName);

  const {latest} = metadata[`dist-tags`];
  if (latest === undefined)
    throw new Error(`${packageName} does not have a "latest" tag.`);

  const {shasum} = metadata.versions[latest].dist;
  return `${latest}+sha1.${shasum}`;
}

export async function fetchAvailableTags(packageName: string) {
  const metadata = await fetchAsJson(packageName);
  return metadata[`dist-tags`];
}

export async function fetchAvailableVersions(packageName: string) {
  const metadata = await fetchAsJson(packageName);
  return Object.keys(metadata.versions);
}
