import assert                     from 'assert';
import {UsageError}               from 'clipanion';
import {once}                     from 'events';
import {stderr, stdin}            from 'process';
import {Readable}                 from 'stream';

import {DEFAULT_NPM_REGISTRY_URL} from './npmRegistryUtils';

async function fetch(input: string | URL, init?: RequestInit) {
  if (process.env.COREPACK_ENABLE_NETWORK === `0`)
    throw new UsageError(`Network access disabled by the environment; can't reach ${input}`);

  const agent = await getProxyAgent(input);

  if (typeof input === `string`)
    input = new URL(input);

  let headers = init?.headers;

  const username: string | undefined = input.username || process.env.COREPACK_NPM_USERNAME;
  const password: string | undefined = input.password || process.env.COREPACK_NPM_PASSWORD;

  if (username || password) {
    headers =  {
      ...headers,
      authorization: `Basic ${Buffer.from(`${username}:${password}`).toString(`base64`)}`,
    };

    input.username = input.password = ``;
  }

  if (input.origin === (process.env.COREPACK_NPM_REGISTRY || DEFAULT_NPM_REGISTRY_URL) && process.env.COREPACK_NPM_TOKEN) {
    headers =  {
      ...headers,
      authorization: `Bearer ${process.env.COREPACK_NPM_TOKEN}`,
    };
  }

  let response;
  try {
    response = await globalThis.fetch(input, {
      ...init,
      dispatcher: agent,
      headers,
    });
  } catch (error) {
    throw new Error(
      `Error when performing the request to ${input}; for troubleshooting help, see https://github.com/nodejs/corepack#troubleshooting`,
      {cause: error},
    );
  }

  if (!response.ok) {
    await response.arrayBuffer();
    throw new Error(
      `Server answered with HTTP ${response.status} when performing the request to ${input}; for troubleshooting help, see https://github.com/nodejs/corepack#troubleshooting`,
    );
  }

  return response;
}

export async function fetchAsJson(input: string | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  return response.json() as Promise<any>;
}

export async function fetchUrlStream(input: string | URL, init?: RequestInit) {
  if (process.env.COREPACK_ENABLE_DOWNLOAD_PROMPT === `1`) {
    console.error(`! Corepack is about to download ${input}`);
    if (stdin.isTTY && !process.env.CI) {
      stderr.write(`? Do you want to continue? [Y/n] `);
      stdin.resume();
      const chars = await once(stdin, `data`);
      stdin.pause();

      // n / N
      if (chars[0][0] === 0x6e || chars[0][0] === 0x4e)
        throw new UsageError(`Aborted by the user`);

      // Add a newline to separate Corepack output from the package manager
      console.error();
    }
  }

  const response = await fetch(input, init);
  const webStream = response.body;
  assert(webStream, `Expected stream to be set`);
  const stream = Readable.fromWeb(webStream);
  return stream;
}

let ProxyAgent: typeof import('undici').ProxyAgent;

async function getProxyAgent(input: string | URL) {
  const {getProxyForUrl} = await import(`proxy-from-env`);

  // @ts-expect-error - The internal implementation is compatible with a WHATWG URL instance
  const proxy = getProxyForUrl(input);

  if (!proxy) return undefined;

  if (ProxyAgent == null) {
    // Doing a deep import here since undici isn't tree-shakeable
    const [api, Dispatcher, _ProxyAgent] = await Promise.all([
      // @ts-expect-error internal module is untyped
      import(`undici/lib/api/index.js`),
      // @ts-expect-error internal module is untyped
      import(`undici/lib/dispatcher/dispatcher.js`),
      // @ts-expect-error internal module is untyped
      import(`undici/lib/dispatcher/proxy-agent.js`),
    ]);

    Object.assign(Dispatcher.default.prototype, api.default);
    ProxyAgent = _ProxyAgent.default;
  }

  return new ProxyAgent(proxy);
}
