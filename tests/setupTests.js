/* global jest, expect, beforeEach, afterAll */

const crypto = require(`crypto`);
const process = require(`process`);

jest.retryTimes(2, {logErrorsBeforeRetry: true});

const OLD_ENV = process.env;
// To ensure we test the default behavior, we must remove these env vars
// in case the local machine already set these values.
const processEnv = Object.fromEntries(
  Object.entries(process.env)
    .filter(([key]) => key !== `FORCE_COLOR` && !key.startsWith(`COREPACK_`))
);

switch (process.env.NOCK_ENV || ``) {
  case `record`:
  case `replay`:
    beforeEach(() => {
      process.env = {
        ...processEnv,
        RUN_CLI_ID: `0`,
        NOCK_FILE_NAME: crypto
          .createHash(`md5`)
          .update(expect.getState().currentTestName)
          .digest(`base64url`),
      };
    });
    break;

  case ``: {
    beforeEach(() => {
      process.env = {...processEnv};
    });
  } break;

  default: {
    throw new Error(`Invalid NOCK_ENV variable`);
  }
}

afterAll(() => {
  process.env = OLD_ENV;
});
