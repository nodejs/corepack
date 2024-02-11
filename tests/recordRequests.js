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
      /*
        Due to a bug *somewhere* `v8.deserialize` fails to deserialize
        a `v8.serialize` Buffer if body is a Buffer, Uint8Array,
        ArrayBuffer, or latin1 string on the Windows GitHub Actions
        runner with the following error:
          Unable to deserialize cloned data

        base64 strings works so that's what we'll use for now.

        Tested with Node.js 18.19.0, 20.11.0, and 21.6.1.

        Runner Information:
          Current runner version: '2.312.0'
          Operating System
            Microsoft Windows Server 2022
            10.0.20348
            Datacenter
          Runner Image
            Image: windows-2022
            Version: 20240204.1.0
            Included Software: https://github.com/actions/runner-images/blob/win22/20240204.1/images/windows/Windows2022-Readme.md
            Image Release: https://github.com/actions/runner-images/releases/tag/win22%2F20240204.1
          Runner Image Provisioner
            2.0.341.1
      */
      body: Buffer.from(data).toString(`base64`),
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

    return new Response(Buffer.from(mock.body, `base64`), {
      status: mock.status,
      headers: mock.headers,
    });
  };
}
