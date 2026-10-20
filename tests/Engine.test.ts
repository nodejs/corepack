import {xfs, npath}                           from '@yarnpkg/fslib';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import config                                 from '../config.json' with {type: 'json'};
import {Engine}                               from '../sources/Engine.ts';
import * as corepackUtils                     from '../sources/corepackUtils.ts';
import type {RegistrySpec}                    from '../sources/types.ts';

vi.mock(`../sources/corepackUtils.ts`);

describe(`Yarn default version`, () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.mocked(corepackUtils.isSupportedPackageManagerLocator).mockReturnValue(true);
    const home = await xfs.mktempPromise();
    process.env.COREPACK_HOME = npath.fromPortablePath(home);
    return () => xfs.removePromise(home);
  });

  it(`uses the bundled Modern version when latest lookups are disabled`, async () => {
    process.env.COREPACK_DEFAULT_TO_LATEST = `0`;

    await expect(new Engine().getDefaultVersion(`yarn`)).resolves.toBe(config.definitions.yarn.default);
    expect(config.definitions.yarn.default).toMatch(/^4\./);
    expect(corepackUtils.fetchLatestStableVersion).not.toHaveBeenCalled();
  });

  it(`looks up the Modern release index on a fresh install`, async () => {
    vi.mocked(corepackUtils.fetchLatestStableVersion).mockResolvedValue(`4.99.0`);

    await expect(new Engine().getDefaultVersion(`yarn`)).resolves.toBe(`4.99.0`);
    expect(corepackUtils.fetchLatestStableVersion).toHaveBeenCalledWith({
      type: `url`,
      url: `https://repo.yarnpkg.com/tags`,
      fields: {tags: `aliases`, versions: `tags`},
    });
    // Later calls use the saved Known Good Release, including offline calls.
    process.env.COREPACK_ENABLE_NETWORK = `0`;
    await expect(new Engine().getDefaultVersion(`yarn`)).resolves.toBe(`4.99.0`);
    expect(corepackUtils.fetchLatestStableVersion).toHaveBeenCalledTimes(1);
  });

  it(`preserves an activated Classic release`, async () => {
    const engine = new Engine();
    await engine.activatePackageManager({name: `yarn`, reference: `1.22.22`});

    await expect(engine.getDefaultVersion(`yarn`)).resolves.toBe(`1.22.22`);
    expect(corepackUtils.fetchLatestStableVersion).not.toHaveBeenCalled();
  });

  it(`uses the Modern npm package when a custom registry is configured`, async () => {
    process.env.COREPACK_NPM_REGISTRY = `https://registry.example.org`;
    const registry = {
      type: `npm`, package: `@yarnpkg/cli-dist`, bin: `bin/yarn.js`,
    } satisfies RegistrySpec;
    vi.mocked(corepackUtils.getRegistryFromPackageManagerSpec).mockReturnValue(registry);
    vi.mocked(corepackUtils.fetchLatestStableVersion).mockResolvedValue(`4.99.0`);

    await expect(new Engine().getDefaultVersion(`yarn`)).resolves.toBe(`4.99.0`);
    expect(corepackUtils.getRegistryFromPackageManagerSpec).toHaveBeenCalledWith(config.definitions.yarn.ranges[`>=2.0.0`]);
    expect(corepackUtils.fetchLatestStableVersion).toHaveBeenCalledWith(registry);
  });
});
