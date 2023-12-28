import {jest, describe, beforeEach, beforeAll, it, expect} from '@jest/globals';

import {fetchUrlStream}                                    from '../sources/httpUtils';


describe(`http utils fetchUrlStream`, () => {
  const getUrl = (statusCode: number | string, redirectCode?: number | string) =>
    `https://registry.example.org/answered/${statusCode}${redirectCode ? `?redirectCode=${redirectCode}` : ``}`;

  const httpsGetFn = jest.fn((url: string, _, callback: (response: any) => void) => {
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
    jest.doMock(`https`, () => ({
      get: httpsGetFn,
      Agent: class Agent {},
    }));
  });

  beforeEach(() => {
    httpsGetFn.mockClear();
  });

  it(`correct response answered statusCode should be >= 200 and < 300`, async () => {
    await expect(fetchUrlStream(getUrl(200))).resolves.toMatchObject({
      statusCode: 200,
    });

    await expect(fetchUrlStream(getUrl(299))).resolves.toMatchObject({
      statusCode: 299,
    });

    expect(httpsGetFn).toHaveBeenCalledTimes(2);
  });

  it(`bad response`, async () => {
    await expect(fetchUrlStream(getUrl(300))).rejects.toThrowError();
    await expect(fetchUrlStream(getUrl(199))).rejects.toThrowError();
  });

  it(`redirection with correct response`, async () => {
    await expect(fetchUrlStream(getUrl(301, 200))).resolves.toMatchObject({
      statusCode: 200,
    });

    expect(httpsGetFn).toHaveBeenCalledTimes(2);

    await expect(fetchUrlStream(getUrl(308, 299))).resolves.toMatchObject({
      statusCode: 299,
    });

    expect(httpsGetFn).toHaveBeenCalledTimes(4);
  });

  it(`redirection with bad response`, async () => {
    await expect(fetchUrlStream(getUrl(301, 300))).rejects.toThrowError();
    await expect(fetchUrlStream(getUrl(308, 199))).rejects.toThrowError();
    await expect(fetchUrlStream(getUrl(301, 302))).rejects.toThrowError();
    await expect(fetchUrlStream(getUrl(307))).rejects.toThrowError();
  });

  it(`rejects with error`, async () => {
    await expect(fetchUrlStream(getUrl(`error`))).rejects.toThrowError();
  });

  it(`rejects when redirection with error`, async () => {
    await expect(fetchUrlStream(getUrl(307, `error`))).rejects.toThrowError();
  });
});
