"use strict";
const fs = require(`node:fs`);
const path = require(`node:path`);
const v8 = require(`node:v8`);

/**
 * @type {Map<string, {body: string, status:number, headers: Record<string,string>}> | undefined}
 */
let mocks;

const getNockFile = () =>
  path.join(
    __dirname,
    `nock`,
    `${process.env.NOCK_FILE_NAME}-${process.env.RUN_CLI_ID}.dat`,
  );

if (process.env.NOCK_ENV === `record`) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const response = await realFetch(input, init);
    const data = await response.arrayBuffer();

    const minimalHeaders = new Headers();
    for (const headerName of [`content-type`, `content-length`]) {
      const headerValue = response.headers.get(headerName);
      if (headerValue != null) {
        minimalHeaders.set(headerName, headerValue);
      }
    }

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
    if (mocks) {
      fs.mkdirSync(path.dirname(getNockFile()), {recursive: true});
      fs.writeFileSync(getNockFile(), v8.serialize(mocks));
    }
  });
} else if (process.env.NOCK_ENV === `replay`) {
  globalThis.fetch = async (input, init) => {
    try {
      mocks ??= v8.deserialize(fs.readFileSync(getNockFile()));
    } catch (error) {
      if (error.code === `ENOENT`) {
        throw new Error(
          `No nock file found for this test run; run the tests with NOCK_ENV=record to generate one`,
          {cause: error},
        );
      }
      throw error;
    }

    const mock = mocks.get(input.toString());
    if (!mock) throw new Error(`No mock found for ${input}; run the tests with NOCK_ENV=record to generate one`);

    return new Response(Buffer.from(mock.body, `latin1`), {
      status: mock.status,
      headers: mock.headers,
    });
  };
}
