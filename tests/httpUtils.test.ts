import assert                              from 'node:assert';
import {describe, before as beforeAll, it} from 'node:test';

import {fetchUrlStream}                    from '../sources/httpUtils';

function doMock (pkg: string, replacer: (...args: Array<unknown>) => unknown) {
  const actualPath = require.resolve(pkg);
  if (arguments.length === 1) {
    require.cache[actualPath] = require(`../__mocks__/${pkg}`);
  } else {
    const actual = require(pkg);
    const Module = require(`node:module`); // eslint-disable-line global-require
    require.cache[actualPath] = new Module(actualPath, module);
    Object.defineProperties(require.cache[actualPath], {
      exports: {
        // @ts-expect-error TS is wrong
        __proto__: null,
        value: replacer(actual),
      },
      // @ts-expect-error TS is wrong
      resetFn: {__proto__: null, value: replacer.bind(null, actual)},
    });
  }
}


describe(`http utils fetchUrlStream`, () => {
  const getUrl = (statusCode: number | string, redirectCode?: number | string) =>
    `https://registry.example.org/answered/${statusCode}${redirectCode ? `?redirectCode=${redirectCode}` : ``}`;

  const httpsGetFn = ((url: string, _: never, callback: (response: any) => void) => {
    const parsedURL = new URL(url);
    const statusCode = parsedURL.pathname.slice(parsedURL.pathname.lastIndexOf(`/`) + 1);
    const response = {url, statusCode: +statusCode};
    const errorCallbacks: Array<(err: string) => void> = [];

    if ([301, 302, 307, 308].includes(+statusCode)) {
      const redirectCode = parsedURL.searchParams.get(`redirectCode`)!;
      // mock response.headers.location
      if (redirectCode) {
        Reflect.set(response, `headers`, {location: getUrl(redirectCode)});
      }
    }

    // handle request.on('error', err => ...)
    if (statusCode === `error`)
      process.nextTick(() => errorCallbacks.forEach(cb => cb(`Test internal error`)));
    else
      callback(response);

    return {
      on: (type: string, callback: (err: string) => void) => {
        if (type === `error`) {
          errorCallbacks.push(callback);
        }
      },
    };
  });

  beforeAll(() => {
    doMock(`https`, () => ({
      get: httpsGetFn,
      Agent: class Agent {},
    }));
  });

  it(`correct response answered statusCode should be >= 200 and < 300`, async () => {
    assert.strictEqual((await fetchUrlStream(getUrl(200))).statusCode,  200);
    assert.strictEqual((await fetchUrlStream(getUrl(299))).statusCode,  299);
  });

  it(`bad response`, async () => {
    await assert.rejects(fetchUrlStream(getUrl(300)));
    await assert.rejects(fetchUrlStream(getUrl(199)));
  });

  it(`redirection with correct response`, async () => {
    assert.strictEqual((await fetchUrlStream(getUrl(301, 200))).statusCode,  200);
    assert.strictEqual((await fetchUrlStream(getUrl(308, 299))).statusCode,  299);
  });

  it(`redirection with bad response`, async () => {
    await assert.rejects(fetchUrlStream(getUrl(301, 300)));
    await assert.rejects(fetchUrlStream(getUrl(308, 199)));
    await assert.rejects(fetchUrlStream(getUrl(301, 302)));
    await assert.rejects(fetchUrlStream(getUrl(307)));
  });

  it(`rejects with error`, async () => {
    await assert.rejects(fetchUrlStream(getUrl(`error`)));
  });

  it(`rejects when redirection with error`, async () => {
    await assert.rejects(fetchUrlStream(getUrl(307, `error`)));
  });
});
