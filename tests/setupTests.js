/* global jest, expect, beforeEach, afterAll */

const crypto = require(`crypto`);
const process = require(`process`);

jest.retryTimes(2, {logErrorsBeforeRetry: true});

const OLD_ENV = process.env;
const {
  // To ensure we test the default behavior, we must remove these env vars
  // in case the local machine already set these values.
  COREPACK_DEFAULT_TO_LATEST,
  COREPACK_ENABLE_NETWORK,
  COREPACK_ENABLE_PROJECT_SPEC,
  COREPACK_ENABLE_STRICT,
  COREPACK_HOME,
  COREPACK_NPM_REGISTRY,
  COREPACK_NPM_TOKEN,
  COREPACK_NPM_USERNAME,
  FORCE_COLOR,
  // We save the rest to put it into `process.env` for tests.
  ...processEnv
} = process.env;

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
