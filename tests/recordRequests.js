"use strict";
const fs = require(`node:fs`);
const path = require(`node:path`);
const v8 = require(`node:v8`);

/**
 * @type {Map<string, {body: string, status:number, headers: Record<string,string>}>}
 */
let mocks = new Map();

function getNockFile() {
  return path.join(
    __dirname,
    `nock`,
    `${process.env.NOCK_FILE_NAME}-${process.env.RUN_CLI_ID}.dat`,
  );
}

if (process.env.NOCK_ENV === `record`) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const response = await realFetch(input, init);
    const data = await response.arrayBuffer();

    const minimalHeaders = new Headers();
    const contentType = response.headers.get(`content-type`);
    const contentLength = response.headers.get(`content-length`);
    if (contentType != null)
      minimalHeaders.set(`content-type`, contentType);
    if (contentLength != null)
      minimalHeaders.set(`content-length`, contentLength);

    mocks ??= new Map();
    mocks.set(input.toString(), {
      body: Buffer.from(data).toString(`latin1`),
      status: response.status,
      headers: Object.fromEntries(minimalHeaders),
    });

    return new Response(data, {
      status: response.status,
      headers: minimalHeaders,
    });
  };

  process.once(`exit`, () => {
    if (mocks.size) {
      fs.mkdirSync(path.dirname(getNockFile()), {recursive: true});
      fs.writeFileSync(getNockFile(), v8.serialize(mocks));
    }
  });
} else if (process.env.NOCK_ENV === `replay`) {
  let mocksLoaded = false;
  globalThis.fetch = async (input, init) => {
    if (!mocksLoaded) {
      if (!fs.existsSync(getNockFile())) {
        throw new Error(
          `No nock file found for this test run; run the tests with NOCK_ENV=record to generate one`,
        );
      }

      mocks = v8.deserialize(fs.readFileSync(getNockFile()));
      mocksLoaded = true;
    }

    const mock = mocks.get(input.toString());
    if (!mock) throw new Error(`No mock found for ${input}`);

    return new Response(Buffer.from(mock.body, `latin1`), {
      status: mock.status,
      headers: mock.headers,
    });
  };
}
