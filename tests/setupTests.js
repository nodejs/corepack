/* global jest, expect, beforeEach, afterAll */

const crypto = require(`crypto`);

jest.retryTimes(2, {logErrorsBeforeRetry: true});

switch (process.env.NOCK_ENV || ``) {
  case `record`:
  case `replay`:
    beforeEach(() => {
      // To ensure we test the default behavior, we must remove these env vars
      // in case the local machine already set these values.
      delete process.env.COREPACK_DEFAULT_TO_LATEST;
      delete process.env.COREPACK_ENABLE_NETWORK;
      delete process.env.COREPACK_ENABLE_PROJECT_SPEC;
      delete process.env.COREPACK_ENABLE_STRICT;
      delete process.env.COREPACK_HOME;
      delete process.env.COREPACK_NPM_REGISTRY;
      delete process.env.COREPACK_NPM_TOKEN;
      delete process.env.COREPACK_NPM_USERNAME;
      delete process.env.FORCE_COLOR;

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
