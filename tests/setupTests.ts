import process                from 'process';
import {beforeEach, afterAll} from 'vitest';

const OLD_ENV = process.env;
// To ensure we test the default behavior, we must remove these env vars
// in case the local machine already set these values.
const processEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => key !== `FORCE_COLOR` && key !== `DEBUG` && !key.startsWith(`COREPACK_`),
  ),
);

beforeEach(() => {
  process.env = {...processEnv};
  process.env.COREPACK_CONFIG_FILE = `0`;
});

afterAll(() => {
  process.env = OLD_ENV;
});
