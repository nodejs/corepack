/* global jest, expect, beforeEach, afterAll */

const crypto = require(`crypto`);

jest.retryTimes(2, {logErrorsBeforeRetry: true});

switch (process.env.NOCK_ENV || ``) {
  case `record`:
  case `replay`:
    beforeEach(() => {
      process.env.RUN_CLI_ID = 0;
      process.env.NOCK_FILE_NAME = crypto
        .createHash(`md5`)
        .update(expect.getState().currentTestName)
        .digest(`base64url`);
    });

    afterAll(() => {
      delete process.env.RUN_CLI_ID;
      delete process.env.NOCK_FILE_NAME;
    });
    break;

  case ``: {
    // Nothing
  } break;

  default: {
    throw new Error(`Invalid NOCK_ENV variable`);
  }
}
