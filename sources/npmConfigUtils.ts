import {Buffer}                   from 'node:buffer';
import {readFile, stat}           from 'node:fs/promises';
import os                         from 'node:os';
import path                       from 'node:path';
import process                    from 'node:process';

import {isNodeError}              from './nodeUtils.ts';
import {DEFAULT_NPM_REGISTRY_URL} from './npmRegistryUtils.ts';

export function matchesRegistry(url: URL, registry: URL) {
  const pathname = `${registry.pathname.replace(/\/+$/, ``)}/`;
  return url.origin === registry.origin && (url.pathname === pathname.slice(0, -1) || url.pathname.startsWith(pathname));
}

async function readConfig(filename: string) {
  try {
    return await readFile(filename, `utf8`);
  } catch (error) {
    if (isNodeError(error) && (error.code === `ENOENT` || error.code === `ENOTDIR`))
      return ``;
    throw error;
  }
}

async function findProjectConfig() {
  // Dependencies must not supply credentials for the enclosing project.
  let cwd = process.cwd().split(/[\\/]node_modules(?:[\\/]|$)/)[0];
  while (true) {
    const config = await readConfig(path.join(cwd, `.npmrc`));
    if (config)
      return config;

    try {
      await stat(path.join(cwd, `package.json`));
      return ``;
    } catch (error) {
      if (!isNodeError(error) || (error.code !== `ENOENT` && error.code !== `ENOTDIR`)) {
        throw error;
      }
    }

    const parent = path.dirname(cwd);
    if (parent === cwd)
      return ``;
    cwd = parent;
  }
}

function parseConfig(content: string, config: Map<string, string | undefined>) {
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(\/\/.+\/:(_authToken|_auth|username|_password))\s*=\s*(.*?)\s*$/);
    if (!match)
      continue;

    let value = match[3];
    if ((value.startsWith(`"`) && value.endsWith(`"`)) || (value.startsWith(`'`) && value.endsWith(`'`)))
      value = value.slice(1, -1);
    else
      value = value.replace(/\s+[;#].*$/, ``).trim();

    let unresolved = false;
    value = value.replace(/(\\*)\$\{([^}]+)\}/g, (match, escapes: string, name: string) => {
      if (escapes.length % 2 === 1)
        return match.slice(1);
      const replacement = process.env[name];
      if (replacement === undefined)
        unresolved = true;
      return escapes + (replacement ?? ``);
    });
    config.set(match[1], unresolved ? undefined : value);
  }
}

export async function getAuthentication(url: URL): Promise<string | undefined> {
  const registry = new URL(process.env.COREPACK_NPM_REGISTRY || DEFAULT_NPM_REGISTRY_URL);
  if (matchesRegistry(url, registry)) {
    if (`COREPACK_NPM_TOKEN` in process.env)
      return `Bearer ${process.env.COREPACK_NPM_TOKEN}`;
    if (`COREPACK_NPM_USERNAME` in process.env && `COREPACK_NPM_PASSWORD` in process.env) {
      return `Basic ${Buffer.from(`${process.env.COREPACK_NPM_USERNAME}:${process.env.COREPACK_NPM_PASSWORD}`).toString(`base64`)}`;
    }
  }

  if (url.username || url.password)
    return `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString(`base64`)}`;

  if (matchesRegistry(url, registry) && (registry.username || registry.password))
    return `Basic ${Buffer.from(`${decodeURIComponent(registry.username)}:${decodeURIComponent(registry.password)}`).toString(`base64`)}`;

  const config = new Map<string, string | undefined>();
  const userConfig = process.env.npm_config_userconfig || process.env.NPM_CONFIG_USERCONFIG || path.join(os.homedir(), `.npmrc`);
  parseConfig(await readConfig(userConfig), config);
  parseConfig(await findProjectConfig(), config);

  const scopes = new Set(Array.from(config.keys(), key => key.slice(0, key.lastIndexOf(`:`))));
  for (const scope of [...scopes].sort((a, b) => b.length - a.length)) {
    let scopedRegistry;
    try {
      scopedRegistry = new URL(`${url.protocol}${scope}`);
    } catch {
      continue;
    }
    if (scopedRegistry.username || scopedRegistry.password || scopedRegistry.search || scopedRegistry.hash || !matchesRegistry(url, scopedRegistry))
      continue;

    const token = config.get(`${scope}:_authToken`);
    if (token)
      return `Bearer ${token}`;
    const auth = config.get(`${scope}:_auth`);
    if (auth)
      return `Basic ${auth}`;
    const username = config.get(`${scope}:username`);
    const password = config.get(`${scope}:_password`);
    if (username !== undefined && password !== undefined) {
      return `Basic ${Buffer.from(`${username}:${Buffer.from(password, `base64`).toString(`utf8`)}`).toString(`base64`)}`;
    }
  }
  return undefined;
}
