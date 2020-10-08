import {Filename, ppath, xfs, npath} from '@yarnpkg/fslib';

import config                        from '../config.json';

import {runCli}                      from './_runCli';

beforeEach(async () => {
  process.env.COREPACK_HOME = npath.fromPortablePath(await xfs.mktempPromise());
});

for (const [name, version] of [[`yarn`, `1.22.4`], [`yarn`, `2.0.0-rc.30`], [`pnpm`, `4.11.6`], [`npm`, `6.14.2`]]) {
  it(`should use the right package manager version for a given project (${name}@${version})`, async () => {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
        packageManager: `${name}@${version}`,
      });

      await expect(runCli(cwd, [name, name, `--version`])).resolves.toMatchObject({
        exitCode: 0,
        stdout: `${version}\n`,
      });
    });
  });
}

it(`shouldn't allow using regular Yarn commands on npm-configured projects`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `npm@6.14.2`,
    });

    await expect(runCli(cwd, [`yarn`, `yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 1,
    });
  });
});

it(`should allow using transparent commands on npm-configured projects`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `npm@6.14.2`,
    });

    await expect(runCli(cwd, [`yarn`, `yarn`, `dlx`, `cat@0.2.0`, __filename])).resolves.toMatchObject({
      exitCode: 0,
    });
  });
});

it(`should transparently use the preconfigured version when there is no local project`, async () => {
  await xfs.mktempPromise(async cwd => {
    await expect(runCli(cwd, [`yarn`, `yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
    });
  });
});

it(`should use the pinned version when local projects don't list any spec`, async () => {
  // Note that we don't prevent using any package manager. This ensures that
  // projects will receive as little disruption as possible (for example, we
  // don't prompt to set the packageManager field).

  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      // empty package.json file
    });

    await expect(runCli(cwd, [`yarn`, `yarn`, `--version`])).resolves.toMatchObject({
      stdout: `${config.definitions.yarn.default}\n`,
      exitCode: 0,
    });

    await expect(runCli(cwd, [`pnpm`, `pnpm`, `--version`])).resolves.toMatchObject({
      stdout: `${config.definitions.pnpm.default}\n`,
      exitCode: 0,
    });

    await expect(runCli(cwd, [`npm`, `npm`, `--version`])).resolves.toMatchObject({
      stdout: `${config.definitions.npm.default}\n`,
      exitCode: 0,
    });
  });
});

it(`should allow updating the pinned version using the "prepare" command`, async () => {
  await xfs.mktempPromise(async cwd => {
    await expect(runCli(cwd, [`prepare`, `--activate`, `yarn@1.0.0`])).resolves.toMatchObject({
      exitCode: 0,
    });

    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      // empty package.json file
    });

    await expect(runCli(cwd, [`yarn`, `yarn`, `--version`])).resolves.toMatchObject({
      stdout: `1.0.0\n`,
      exitCode: 0,
    });
  });
});

it(`should allow to call "prepare" without arguments within a configured project`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@1.0.0`,
    });

    await expect(runCli(cwd, [`prepare`, `--activate`])).resolves.toMatchObject({
      exitCode: 0,
    });

    await expect(runCli(cwd, [`yarn`, `yarn`, `--version`])).resolves.toMatchObject({
      stdout: `1.0.0\n`,
      exitCode: 0,
    });
  });
});

it(`should allow to call "prepare" with --all to prepare all package managers`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      // empty package.json file
    });

    await expect(runCli(cwd, [`prepare`, `--all`])).resolves.toMatchObject({
      exitCode: 0,
    });

    process.env.COREPACK_ENABLE_NETWORK = `0`;

    try {
      await expect(runCli(cwd, [`yarn`, `yarn`, `--version`])).resolves.toMatchObject({
        stdout: `${config.definitions.yarn.default}\n`,
        exitCode: 0,
      });

      await expect(runCli(cwd, [`pnpm`, `pnpm`, `--version`])).resolves.toMatchObject({
        stdout: `${config.definitions.pnpm.default}\n`,
        exitCode: 0,
      });

      await expect(runCli(cwd, [`npm`, `npm`, `--version`])).resolves.toMatchObject({
        stdout: `${config.definitions.npm.default}\n`,
        exitCode: 0,
      });
    } finally {
      delete process.env.COREPACK_ENABLE_NETWORK;
    }
  });
});

it(`should support disabling the network accesses from the environment`, async () => {
  process.env.COREPACK_ENABLE_NETWORK = `0`;

  try {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
        packageManager: `yarn@2.2.2`,
      });

      await expect(runCli(cwd, [`yarn`, `yarn`, `--version`])).resolves.toMatchObject({
        stdout: expect.stringContaining(`Network access disabled by the environment`),
        exitCode: 1,
      });
    });
  } finally {
    delete process.env.COREPACK_ENABLE_NETWORK;
  }
});

it(`should support hydrating package managers from cached archives`, async () => {
  await xfs.mktempPromise(async cwd => {
    await expect(runCli(cwd, [`prepare`, `yarn@2.2.2`, `-o`])).resolves.toMatchObject({
      exitCode: 0,
    });

    // Use a new cache
    process.env.COREPACK_HOME = npath.fromPortablePath(await xfs.mktempPromise());

    // Disable the network to make sure we don't succeed by accident
    process.env.COREPACK_ENABLE_NETWORK = `0`;

    try {
      await expect(runCli(cwd, [`hydrate`, `corepack.tgz`])).resolves.toMatchObject({
        stdout: `Hydrating yarn@2.2.2...\nAll done!\n`,
        exitCode: 0,
      });

      await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
        packageManager: `yarn@2.2.2`,
      });

      await expect(runCli(cwd, [`yarn`, `yarn`, `--version`])).resolves.toMatchObject({
        stdout: `2.2.2\n`,
        exitCode: 0,
      });
    } finally {
      delete process.env.COREPACK_ENABLE_NETWORK;
    }
  });
});

it(`should support hydrating multiple package managers from cached archives`, async () => {
  await xfs.mktempPromise(async cwd => {
    await expect(runCli(cwd, [`prepare`, `yarn@2.2.2`, `pnpm@5.8.0`, `-o`])).resolves.toMatchObject({
      exitCode: 0,
    });

    // Use a new cache
    process.env.COREPACK_HOME = npath.fromPortablePath(await xfs.mktempPromise());

    // Disable the network to make sure we don't succeed by accident
    process.env.COREPACK_ENABLE_NETWORK = `0`;

    try {
      await expect(runCli(cwd, [`hydrate`, `corepack.tgz`])).resolves.toMatchObject({
        stdout: `Hydrating yarn@2.2.2...\nHydrating pnpm@5.8.0...\nAll done!\n`,
        exitCode: 0,
      });

      await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
        packageManager: `yarn@2.2.2`,
      });

      await expect(runCli(cwd, [`yarn`, `yarn`, `--version`])).resolves.toMatchObject({
        stdout: `2.2.2\n`,
        exitCode: 0,
      });

      await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
        packageManager: `pnpm@5.8.0`,
      });

      await expect(runCli(cwd, [`pnpm`, `pnpm`, `--version`])).resolves.toMatchObject({
        stdout: `5.8.0\n`,
        exitCode: 0,
      });
    } finally {
      delete process.env.COREPACK_ENABLE_NETWORK;
    }
  });
});

it(`should support running package managers with bin array`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@2.2.2`,
    });

    await expect(runCli(cwd, [`yarn`, `yarnpkg`, `--version`])).resolves.toMatchObject({
      stdout: `2.2.2\n`,
      exitCode: 0,
    });

    await expect(runCli(cwd, [`yarn`, `yarn`, `--version`])).resolves.toMatchObject({
      stdout: `2.2.2\n`,
      exitCode: 0,
    });
  });
});
