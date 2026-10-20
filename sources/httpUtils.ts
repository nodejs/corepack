import assert                               from 'assert';
import {UsageError}                         from 'clipanion';
import {once}                               from 'events';
import {stderr, stdin}                      from 'process';
import {Readable}                           from 'stream';

import {getAuthentication, matchesRegistry} from './npmConfigUtils.ts';

async function fetch(input: string | URL, init?: RequestInit, redirects = 0, authorizationScope?: URL): Promise<Response> {
  if (process.env.COREPACK_ENABLE_NETWORK === `0`)
    throw new UsageError(`Network access disabled by the environment; can't reach ${input}`);

  input = new URL(input);
  authorizationScope ??= new URL(`.`, input);

  let headers = init?.headers;

  const authorization = await getAuthentication(input);
  input.username = input.password = ``;
  if (authorization !== undefined) {
    headers = new Headers(headers);
    headers.set(`authorization`, authorization);
  }

  let response;
  try {
    response = await globalThis.fetch(input, {
      ...init,
      headers,
      redirect: `manual`,
    });
  } catch (error) {
    throw new Error(
      `Error when performing the request to ${input}; for troubleshooting help, see https://github.com/nodejs/corepack#troubleshooting`,
      {cause: error},
    );
  }

  if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.has(`location`) && init?.redirect !== `manual`) {
    await response.arrayBuffer();
    if (init?.redirect === `error`)
      throw new Error(`Unexpected redirect when performing the request to ${input}`);
    if (redirects === 20)
      throw new Error(`Too many redirects when performing the request to ${input}`);
    const target = new URL(response.headers.get(`location`)!, input);
    const redirectHeaders = new Headers(init?.headers);
    if (!matchesRegistry(target, authorizationScope))
      redirectHeaders.delete(`authorization`);

    const method = init?.method?.toUpperCase() ?? `GET`;
    if (((response.status === 301 || response.status === 302) && method === `POST`) || (response.status === 303 && method !== `GET` && method !== `HEAD`)) {
      init = {...init, method: `GET`, body: undefined};
      for (const header of [`content-encoding`, `content-language`, `content-location`, `content-type`, `content-length`]) {
        redirectHeaders.delete(header);
      }
    }
    return fetch(target, {...init, headers: redirectHeaders}, redirects + 1, authorizationScope);
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
