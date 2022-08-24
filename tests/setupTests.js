/* global expect, beforeEach, afterEach */

const crypto = require(`crypto`);

switch (process.env.NOCK_ENV || ``) {
  case `record`:
  case `replay`:
    {
      beforeEach(() => {
        process.env.NOCK_FILE_NAME = crypto
          .createHash(`md5`)
          .update(expect.getState().currentTestName)
          .digest(`hex`);
      });
    }
    break;

  case ``: {
    // Nothing
  } break;

  default: {
    throw new Error(`Invalid NOCK_ENV variable`);
  }
}
