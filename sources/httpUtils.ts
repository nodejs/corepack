import assert          from 'assert';
import {UsageError}    from 'clipanion';
import {once}          from 'events';
import {stderr, stdin} from 'process';
import {Readable}      from 'stream';

export async function fetch(input: string | URL, init?: RequestInit) {
  if (process.env.COREPACK_ENABLE_NETWORK === `0`)
    throw new UsageError(`Network access disabled by the environment; can't reach ${input}`);

  const agent = await getProxyAgent(input);

  if (process.env.COREPACK_ENABLE_DOWNLOAD_PROMPT === `1`) {
    console.error(`Corepack is about to download ${input}.`);
    if (stdin.isTTY && !process.env.CI) {
      stderr.write(`\nDo you want to continue? [Y/n] `);
      stdin.resume();
      const chars = await once(stdin, `data`);
      stdin.pause();
      if (
        chars[0][0] === 0x6e || // n
        chars[0][0] === 0x4e // N
      ) {
        throw new UsageError(`Aborted by the user`);
      }
    }
  }

  let response;
  try {
    response = await globalThis.fetch(input, {
      ...init,
      dispatcher: agent,
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
  const response = await fetch(input, init);
  const webStream = response.body;
  assert(webStream, `Expected stream to be set`);
  const stream = Readable.fromWeb(webStream);
  return stream;
}

async function getProxyAgent(input: string | URL) {
  const {getProxyForUrl} = await import(`proxy-from-env`);

  // @ts-expect-error - The internal implementation is compatible with a WHATWG URL instance
  const proxy = getProxyForUrl(input);

  if (!proxy) return undefined;

  // Doing a deep import here since undici isn't tree-shakeable
  const {default: ProxyAgent} = (await import(
    // @ts-expect-error No types for this specific file
    `undici/lib/proxy-agent.js`
  )) as { default: typeof import('undici').ProxyAgent };

  return new ProxyAgent(proxy);
}
