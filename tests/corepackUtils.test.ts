import {describe, it, expect}     from 'vitest';

import {shouldSkipIntegrityCheck} from '../sources/corepackUtils';

describe(`corepack utils shouldSkipIntegrityCheck`, () => {
  it(`should return false if COREPACK_INTEGRITY_KEYS env is not set`, () => {
    delete process.env.COREPACK_INTEGRITY_KEYS;
    expect(shouldSkipIntegrityCheck()).toBe(false);
  });

  it(`should return true if COREPACK_INTEGRITY_KEYS env is set to 0`, () => {
    process.env.COREPACK_INTEGRITY_KEYS = `0`;
    expect(shouldSkipIntegrityCheck()).toBe(true);
  });

  it(`should return true if COREPACK_INTEGRITY_KEYS env is set to an empty string`, () => {
    process.env.COREPACK_INTEGRITY_KEYS = ``;
    expect(shouldSkipIntegrityCheck()).toBe(true);
  });

  it(`should return false if COREPACK_INTEGRITY_KEYS env is set to any other value`, () => {
    process.env.COREPACK_INTEGRITY_KEYS = JSON.stringify({foo: `bar`});
    expect(shouldSkipIntegrityCheck()).toBe(false);
  });
});
