/* global jest, beforeEach, afterAll */

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

beforeEach(() => {
  process.env = {...processEnv};
});

afterAll(() => {
  process.env = OLD_ENV;
});
