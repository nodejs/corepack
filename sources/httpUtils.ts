import {UsageError}                          from 'clipanion';
import {once}                                from 'events';
import type {RequestOptions}                 from 'https';
import type {IncomingMessage, ClientRequest} from 'http';
import {stderr, stdin}                       from 'process';

export async function fetchUrlStream(url: string, options: RequestOptions = {}) {
  if (process.env.COREPACK_ENABLE_NETWORK === `0`)
    throw new UsageError(`Network access disabled by the environment; can't reach ${url}`);

  const {default: https} = await import(`https`);

  const {ProxyAgent} = await import(`proxy-agent`);

  const proxyAgent = new ProxyAgent();

  if (process.env.COREPACK_ENABLE_DOWNLOAD_PROMPT === `1`) {
    console.error(`Corepack is about to download ${url}.`);
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

  return new Promise<IncomingMessage>((resolve, reject) => {
    const createRequest = (url: string) => {
      const request: ClientRequest = https.get(url, {...options, agent: proxyAgent}, response => {
        const statusCode = response.statusCode;

        if ([301, 302, 307, 308].includes(statusCode as number) && response.headers.location)
          return createRequest(response.headers.location as string);

        if (statusCode != null && statusCode >= 200 && statusCode < 300)
          return resolve(response);

        return reject(new Error(`Server answered with HTTP ${statusCode} when performing the request to ${url}; for troubleshooting help, see https://github.com/nodejs/corepack#troubleshooting`));
      });

      request.on(`error`, err => {
        reject(new Error(`Error when performing the request to ${url}; for troubleshooting help, see https://github.com/nodejs/corepack#troubleshooting`));
      });
    };

    createRequest(url);
  });
}

export async function fetchAsBuffer(url: string, options?: RequestOptions) {
  const response = await fetchUrlStream(url, options);

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Array<Buffer> = [];

    response.on(`data`, chunk => {
      chunks.push(chunk);
    });

    response.on(`error`, error => {
      reject(error);
    });

    response.on(`end`, () => {
      resolve(Buffer.concat(chunks));
    });
  });
}

export async function fetchAsJson(url: string, options?: RequestOptions) {
  const buffer = await fetchAsBuffer(url, options);
  const asText = buffer.toString();

  try {
    return JSON.parse(asText);
  } catch (error) {
    const truncated = asText.length > 30
      ? `${asText.slice(0, 30)}...`
      : asText;

    throw new Error(`Couldn't parse JSON data: ${JSON.stringify(truncated)}`);
  }
}
