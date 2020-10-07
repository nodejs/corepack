/* global expect, beforeEach, afterEach */

const crypto = require(`crypto`);
const fs = require(`fs`);
const nock = require(`nock`);
const path = require(`path`);
const v8 = require(`v8`);

const getNockFile = () => path.join(__dirname, `nock/${crypto.createHash(`md5`).update(expect.getState().currentTestName).digest(`hex`)}.dat`);

switch (process.env.NOCK_ENV || ``) {
  case `record`: {
    nock.recorder.rec({
      // eslint-disable-next-line @typescript-eslint/camelcase
      dont_print: true,
      // eslint-disable-next-line @typescript-eslint/camelcase
      output_objects: true,
    });

    beforeEach(() => {
      nock.recorder.clear();
    });

    afterEach(() => {
      const nockCallObjects = nock.recorder.play();
      const serialized = v8.serialize(nockCallObjects);
      fs.mkdirSync(path.dirname(getNockFile()), {recursive: true});
      fs.writeFileSync(getNockFile(), serialized);
    });
  } break;

  case `replay`: {
    nock.disableNetConnect();

    beforeEach(() => {
      const data = fs.readFileSync(getNockFile());
      const nockCallObjects = v8.deserialize(data);
      nock.define(nockCallObjects);
    });
  } break;

  case ``: {
    // Nothing
  } break;

  default: {
    throw new Error(`Invalid NOCK_ENV variable`);
  }
}
