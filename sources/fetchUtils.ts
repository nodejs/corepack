import {UsageError}    from 'clipanion';
import {once}          from 'events';
import fs              from 'node:fs';
import path            from 'node:path';
import {stderr, stdin} from 'process';

let mocks: Map<string, {
  body: ArrayBuffer;
  status: number;
  headers: Record<string, string>;
}>;

if (process.env.NOCK_ENV === `record`) {
  process.once(`exit`, () => {
    if (!mocks)
      return;

    fs.mkdirSync(path.dirname(getNockFile()), {recursive: true});
    fs.writeFileSync(getNockFile(), JSON.stringify(Array.from(mocks.entries()), (key, value) => {
      return value instanceof ArrayBuffer ? Buffer.from(value).toString(`base64`) : value;
    }, `\t`));
  });
}

function getMocks() {
  if (mocks)
    return mocks;

  if (!fs.existsSync(getNockFile()))
    throw new Error(`No nock file found for this test run; run the tests with NOCK_ENV=record to generate one`);

  mocks = new Map(JSON.parse(fs.readFileSync(getNockFile(), `utf8`), (key, value) => {
    return typeof value === `string` && key === `body` ? Buffer.from(value, `base64`) : value;
  }));

  return mocks;
}

export async function fetch(input: string | URL, init?: RequestInit) {
  if (process.env.COREPACK_ENABLE_NETWORK === `0`)
    throw new UsageError(`Network access disabled by the environment; can't reach ${input}`);

  if (process.env.NOCK_ENV === `record`) {
    const response = await fetchWrapper(input, init);
    const data = await response.arrayBuffer();

    const minimalHeaders = new Headers();
    if (response.headers.has(`content-type`))
      minimalHeaders.set(`content-type`, response.headers.get(`content-type`)!);
    if (response.headers.has(`content-length`))
      minimalHeaders.set(`content-length`, response.headers.get(`content-length`)!);

    mocks ??= new Map();
    mocks.set(input.toString(), {
      body: data,
      status: response.status,
      headers: Object.fromEntries(minimalHeaders),
    });

    return new Response(data, {
      status: response.status,
      headers: minimalHeaders,
    });
  } else if (process.env.NOCK_ENV === `replay`) {
    const mocks = getMocks();

    const mock = mocks.get(input.toString());
    if (!mock)
      throw new Error(`No mock found for ${input}`);

    return new Response(mock.body, {
      status: mock.status,
      headers: mock.headers,
    });
  } else {
    return fetchWrapper(input, init);
  }
}

export async function fetchJSON(input: string | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch (error) {
    const truncated = text.length > 30
      ? `${text.slice(0, 30)}...`
      : text;

    throw new Error(`Couldn't parse JSON data: ${JSON.stringify(truncated)}`);
  }
}

async function fetchWrapper(input: string | URL, init?: RequestInit) {
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

async function getProxyAgent(input: string | URL) {
  const {getProxyForUrl} = await import(`proxy-from-env`);

  const proxy = getProxyForUrl(input.toString());

  if (!proxy) return undefined;

  // Doing a deep import here since undici isn't tree-shakeable
  const {default: ProxyAgent} = (await import(
    // @ts-expect-error No types for this specific file
    `undici/lib/proxy-agent.js`
  )) as { default: typeof import('undici').ProxyAgent };

  return new ProxyAgent(proxy);
}

function getNockFile() {
  return path.join(
    path.dirname(require.resolve(`corepack/package.json`)),
    `tests/nock`,
    `${process.env.NOCK_FILE_NAME}-${process.env.RUN_CLI_ID}.json`,
  );
}
