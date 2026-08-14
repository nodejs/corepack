import {vi, describe, it, expect} from 'vitest';

import defaultConfig              from '../config.json' with {type: 'json'};
import {DEFAULT_NPM_REGISTRY_URL} from '../sources/npmRegistryUtils.ts';

vi.mock(`../sources/httpUtils.ts`);

describe(`key store should be up-to-date`, () => {
  it(`should contain up-to-date npm keys`, async () => {
    const r = await globalThis.fetch(new URL(`/-/npm/v1/keys`, DEFAULT_NPM_REGISTRY_URL));
    expect(r.ok).toBe(true);
    await expect(r.json()).resolves.toMatchObject({keys: defaultConfig.keys.npm});
  });
});
