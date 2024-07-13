import {jest, describe, beforeEach, it, expect}                 from '@jest/globals';
import process                                                  from 'node:process';
import {fetchAsJson as httpFetchAsJson}                         from '../sources/httpUtils';

describe(`httpUtils`, () => {
  beforeEach(() => {
    jest.resetAllMocks();

    globalThis.fetch = jest.fn(() => Promise.resolve( {
      ok: true,
      json: () => Promise.resolve({})
    }));
  });

  it(`adds authorization header if COREPACK_NPM_TOKEN is set with custom COREPACK_NPM_REGISTRY`, async () => {
    // `process.env` is reset after each tests in setupTests.js.
    process.env.COREPACK_NPM_TOKEN = `foo`;
    process.env.COREPACK_NPM_REGISTRY = `https://registry.example.org/with-path/npm`

    await httpFetchAsJson(`${process.env.COREPACK_NPM_REGISTRY}/package-name`);

    expect(globalThis.fetch).toBeCalled();
    expect(globalThis.fetch).lastCalledWith(new URL(`${process.env.COREPACK_NPM_REGISTRY}/package-name`), {
      headers: {
        authorization: `Bearer ${process.env.COREPACK_NPM_TOKEN}`,
      }});
  });

});
