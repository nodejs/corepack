import {UsageError}      from 'clipanion';
import {RequestOptions}  from 'https';
import {IncomingMessage} from 'http';

export async function fetchUrlStream(url: string, options: RequestOptions = {}) {
  if (process.env.COREPACK_ENABLE_NETWORK === `0`)
    throw new UsageError(`Network access disabled by the environment; can't reach ${url}`);

  const {default: https} = await import(`https`);

  return new Promise<IncomingMessage>((resolve, reject) => {
    const request = https.get(url, options, response => {
      const statusCode = response.statusCode ?? 500;
      if (!(statusCode >= 200 && statusCode < 300))
        return reject(new Error(`Server answered with HTTP ${statusCode}`));

      return resolve(response);
    });

    request.on(`error`, err => {
      reject(new Error(`Error when performing the request`));
    });
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
