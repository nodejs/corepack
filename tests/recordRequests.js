"use strict";
const fs = require(`node:fs`);
const path = require(`node:path`);
const v8 = require(`node:v8`);

const nock = require(`nock`);

const getNockFile = () =>
  path.join(
    __dirname,
    `nock`,
    `${process.env.NOCK_FILE_NAME}-${process.env.RUN_CLI_ID}.dat`,
  );
const ACCEPTED_HEADERS = new Set([`Content-Type`, `Content-Length`]);
function filterHeaders(headers) {
  if (!Array.isArray(headers)) return headers;

  const filtered = [];
  for (let t = 0; t < headers.length; t += 2)
    if (ACCEPTED_HEADERS.has(headers[t].toLowerCase()))
      filtered.push(headers[t], headers[t + 1]);

  return filtered;
}

switch (process.env.NOCK_ENV || ``) {
  case `record`:
    nock.recorder.rec({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      dont_print: true,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      output_objects: true,
    });

    process.on(`exit`, () => {
      const nockCallObjects = nock.recorder.play();
      for (const req of nockCallObjects)
        if (typeof req !== `string`)
          req.rawHeaders = filterHeaders(req.rawHeaders);

      const serialized = v8.serialize(nockCallObjects);
      fs.mkdirSync(path.dirname(getNockFile()), {recursive: true});
      fs.writeFileSync(getNockFile(), serialized);
    });
    break;

  case `replay`: {
    const data = fs.readFileSync(getNockFile());
    const nockCallObjects = v8.deserialize(data);
    nock.define(nockCallObjects);
    break;
  }

  default:
}
