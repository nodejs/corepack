import {beforeEach, it, expect}                    from '@jest/globals';
import {Filename, ppath, xfs, npath, PortablePath} from '@yarnpkg/fslib';
import process                                     from 'node:process';

import config                                      from '../config.json';
import * as folderUtils                            from '../sources/folderUtils';
import {SupportedPackageManagerSet}                from '../sources/types';

import {runCli}                                    from './_runCli';


beforeEach(async () => {
  // `process.env` is reset after each tests in setupTests.js.
  process.env.COREPACK_HOME = npath.fromPortablePath(await xfs.mktempPromise());
  process.env.COREPACK_DEFAULT_TO_LATEST = `0`;
});

it(`should refuse to download a package manager if the hash doesn't match`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@1.22.4+sha1.deadbeef`,
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 1,
      stderr: /Mismatch hashes/,
      stdout: ``,
    });
  });
});

it(`should refuse to download a known package manager from a URL`, async () => {
  await xfs.mktempPromise(async cwd => {
    // Package managers known by Corepack cannot be loaded from a URL.
    await expect(runCli(cwd, [`yarn@https://registry.npmjs.com/yarn/-/yarn-1.22.21.tgz`, `--version`])).resolves.toMatchObject({
      exitCode: 1,
      stderr: /Illegal use of URL for known package manager/,
      stdout: ``,
    });

    // Unknown package managers can be loaded from a URL.
    await expect(runCli(cwd, [`corepack@https://registry.npmjs.com/corepack/-/corepack-0.24.1.tgz`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
      stdout: `0.24.1\n`,
    });
  });
});

it.failing(`should refuse to download a known package manager from a URL in package.json`, async () => {
  await xfs.mktempPromise(async cwd => {
    // Package managers known by Corepack cannot be loaded from a URL.
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@https://registry.npmjs.com/yarn/-/yarn-1.22.21.tgz`,
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 1,
      stderr: /Illegal use of URL for known package manager/,
      stdout: ``,
    });

    // Unknown package managers can be loaded from a URL.
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `corepack@https://registry.npmjs.com/corepack/-/corepack-0.24.1.tgz`,
    });

    await expect(runCli(cwd, [`corepack`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
      stdout: `0.24.1\n`,
    });
  });
});

it(`should require a version to be specified`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn`,
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 1,
      stderr: /expected a semver version/,
      stdout: ``,
    });

    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@stable`,
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 1,
      stderr: /expected a semver version/,
      stdout: ``,
    });

    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@^1.0.0`,
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 1,
      stderr: /expected a semver version/,
      stdout: ``,
    });
  });
});

const testedPackageManagers: Array<[string, string] | [string, string, string]> = [
  [`yarn`, `1.22.4`],
  [`yarn`, `1.22.4+sha1.01c1197ca5b27f21edc8bc472cd4c8ce0e5a470e`],
  [`yarn`, `1.22.4+sha224.0d6eecaf4d82ec12566fdd97143794d0f0c317e0d652bd4d1b305430`],
  [`yarn`, `https://registry.npmjs.com/yarn/-/yarn-1.22.21.tgz`, `1.22.21`],
  [`yarn`, `https://registry.npmjs.com/yarn/-/yarn-1.22.21.tgz#sha1.1959a18351b811cdeedbd484a8f86c3cc3bbaf72`, `1.22.21`],
  [`yarn`, `2.0.0-rc.30`],
  [`yarn`, `2.0.0-rc.30+sha1.4f0423b01bcb57f8e390b4e0f1990831f92dd1da`],
  [`yarn`, `2.0.0-rc.30+sha224.0e7a64468c358596db21c401ffeb11b6534fce7367afd3ae640eadf1`],
  [`yarn`, `3.0.0-rc.2`],
  [`yarn`, `3.0.0-rc.2+sha1.694bdad81703169e203febd57f9dc97d3be867bd`],
  [`yarn`, `3.0.0-rc.2+sha224.f83f6d1cbfac10ba6b516a62ccd2a72ccd857aa6c514d1cd7185ec60`],
  [`pnpm`, `4.11.6`],
  [`pnpm`, `4.11.6+sha1.7cffc04295f4db4740225c6c37cc345eb923c06a`],
  [`pnpm`, `4.11.6+sha224.7783c4b01916b7a69e6ff05d328df6f83cb7f127e9c96be88739386d`],
  [`pnpm`, `6.6.2`],
  [`pnpm`, `6.6.2+sha1.7b4d6b176c1b93b5670ed94c24babb7d80c13854`],
  [`pnpm`, `6.6.2+sha224.eb5c0acad3b0f40ecdaa2db9aa5a73134ad256e17e22d1419a2ab073`],
  [`npm`, `6.14.2`],
  [`npm`, `6.14.2+sha1.f057d35cd4792c4c511bb1fa332edb43143d07b0`],
  [`npm`, `6.14.2+sha224.50512c1eb404900ee78586faa6d756b8d867ff46a328e6fb4cdf3a87`],
];

for (const [name, version, expectedVersion = version.split(`+`, 1)[0]] of testedPackageManagers) {
  it(`should use the right package manager version for a given project (${name}@${version})`, async () => {
    process.env.COREPACK_ENABLE_UNSAFE_CUSTOM_URLS = `1`;
    await xfs.mktempPromise(async cwd => {
      await expect(runCli(cwd, [`${name}@${version}`, `--version`])).resolves.toMatchObject({
        exitCode: 0,
        stderr: ``,
        stdout: `${expectedVersion}\n`,
      });

      await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
        packageManager: `${name}@${version}`,
      });

      await expect(runCli(cwd, [name, `--version`])).resolves.toMatchObject({
        exitCode: 0,
        stderr: ``,
        stdout: `${expectedVersion}\n`,
      });
    });
  });
}

it(`should update the Known Good Release only when the major matches`, async () => {
  await xfs.writeJsonPromise(ppath.join(npath.toPortablePath(folderUtils.getCorepackHomeFolder()), `lastKnownGood.json`), {
    yarn: `1.0.0`,
  });

  process.env.COREPACK_DEFAULT_TO_LATEST = `1`;

  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@1.22.4+sha224.0d6eecaf4d82ec12566fdd97143794d0f0c317e0d652bd4d1b305430`,
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
      stdout: `1.22.4\n`,
    });

    await xfs.removePromise(ppath.join(cwd, `package.json` as Filename));

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
      stdout: `1.22.4\n`,
    });

    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@2.2.2`,
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
      stdout: `2.2.2\n`,
    });

    await xfs.removePromise(ppath.join(cwd, `package.json` as Filename));

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
      stdout: `1.22.4\n`,
    });
  });
});

it(`should ignore the packageManager field when found within a node_modules vendor`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.mkdirPromise(ppath.join(cwd, `node_modules/foo` as PortablePath), {recursive: true});
    await xfs.mkdirPromise(ppath.join(cwd, `node_modules/@foo/bar` as PortablePath), {recursive: true});

    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as PortablePath), {
      packageManager: `yarn@1.22.4`,
    });

    await xfs.writeJsonPromise(ppath.join(cwd, `node_modules/foo/package.json` as PortablePath), {
      packageManager: `npm@6.14.2`,
    });

    await xfs.writeJsonPromise(ppath.join(cwd, `node_modules/@foo/bar/package.json` as PortablePath), {
      packageManager: `npm@6.14.2`,
    });

    await expect(runCli(ppath.join(cwd, `node_modules/foo` as PortablePath), [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
      stdout: `1.22.4\n`,
    });

    await expect(runCli(ppath.join(cwd, `node_modules/@foo/bar` as PortablePath), [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
      stdout: `1.22.4\n`,
    });
  });
});

it(`should use the closest matching packageManager field`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.mkdirPromise(ppath.join(cwd, `foo` as PortablePath), {recursive: true});

    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as PortablePath), {
      packageManager: `yarn@1.22.4`,
    });

    await xfs.writeJsonPromise(ppath.join(cwd, `foo/package.json` as PortablePath), {
      packageManager: `npm@6.14.2`,
    });

    await expect(runCli(ppath.join(cwd, `foo` as PortablePath), [`npm`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
      stdout: `6.14.2\n`,
    });
  });
});

it(`should expose its root to spawned processes`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `npm@6.14.2`,
    });

    await expect(runCli(cwd, [`npm`, `run`, `env`])).resolves.toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining(`COREPACK_ROOT=${npath.dirname(__dirname)}`),
    });
  });
});

it(`shouldn't allow using regular Yarn commands on npm-configured projects`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `npm@6.14.2`,
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining(`This project is configured to use npm`),
    });
  });
});

it(`should allow using transparent commands on npm-configured projects`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `npm@6.14.2`,
    });

    await expect(runCli(cwd, [`yarn`, `dlx`, `--help`])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
    });
  });
});

it(`should transparently use the preconfigured version when there is no local project`, async () => {
  await xfs.mktempPromise(async cwd => {
    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
    });
  });
});

// Note that we don't prevent using any package manager. This ensures that
// projects will receive as little disruption as possible (for example, we
// don't prompt to set the packageManager field).

for (const name of SupportedPackageManagerSet) {
  it(`should use the pinned version when local projects don't list any spec (${name})`, async () => {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
        // empty package.json file
      });

      await expect(runCli(cwd, [name, `--version`])).resolves.toMatchObject({
        stdout: `${config.definitions[name].default.split(`+`, 1)[0]}\n`,
        exitCode: 0,
      });
    });
  });
}

it(`should configure the project when calling a package manager on it for the first time`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      // empty package.json file
    });

    await runCli(cwd, [`yarn`]);

    const data = await xfs.readJsonPromise(ppath.join(cwd, `package.json` as Filename));

    expect(data).toMatchObject({
      packageManager: `yarn@${config.definitions.yarn.default}`,
    });
  });
});

it(`should allow updating the pinned version using the "corepack install -g" command`, async () => {
  await xfs.mktempPromise(async cwd => {
    await expect(runCli(cwd, [`install`, `-g`, `yarn@1.0.0`])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
    });

    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      // empty package.json file
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      stdout: `1.0.0\n`,
      exitCode: 0,
    });
  });
});

it(`should allow to call "corepack install -g" with a tag`, async () => {
  await xfs.mktempPromise(async cwd => {
    await expect(runCli(cwd, [`install`, `-g`, `npm@latest-7`])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
    });

    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      // empty package.json file
    });

    await expect(runCli(cwd, [`npm`, `--version`])).resolves.toMatchObject({
      stdout: expect.stringMatching(/^7\./),
      exitCode: 0,
    });
  });
});

it(`should allow to call "corepack install -g" without any range`, async () => {
  await xfs.mktempPromise(async cwd => {
    await expect(runCli(cwd, [`install`, `-g`, `yarn`])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
    });

    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      // empty package.json file
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      stdout: expect.not.stringMatching(/^[123]\./),
      exitCode: 0,
    });
  });
});

it(`should allow to call "corepack install" without arguments within a configured project`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@1.0.0`,
    });

    await expect(runCli(cwd, [`install`])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
    });

    // Disable the network to make sure we don't succeed by accident
    process.env.COREPACK_ENABLE_NETWORK = `0`;

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      stdout: `1.0.0\n`,
      stderr: ``,
      exitCode: 0,
    });
  });
});

it(`should refuse to run a different package manager within a configured project`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@1.0.0`,
    });

    process.env.FORCE_COLOR = `0`;

    await expect(runCli(cwd, [`pnpm`, `--version`])).resolves.toMatchObject({
      stdout: ``,
      stderr: expect.stringContaining(`This project is configured to use yarn`),
      exitCode: 1,
    });

    // Disable strict checking to workaround the UsageError.
    process.env.COREPACK_ENABLE_STRICT = `0`;

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      stdout: `1.0.0\n`,
      stderr: ``,
      exitCode: 0,
    });
    await expect(runCli(cwd, [`pnpm`, `--version`])).resolves.toMatchObject({
      stdout: `${config.definitions.pnpm.default.split(`+`, 1)[0]}\n`,
      stderr: ``,
      exitCode: 0,
    });
  });
});


it(`should always use fallback version when project spec env is disabled`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@1.0.0`,
    });
    process.env.COREPACK_ENABLE_PROJECT_SPEC = `0`;

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      stdout: `${config.definitions.yarn.default.split(`+`, 1)[0]}\n`,
      stderr: ``,
      exitCode: 0,
    });
    await expect(runCli(cwd, [`pnpm`, `--version`])).resolves.toMatchObject({
      stdout: `${config.definitions.pnpm.default.split(`+`, 1)[0]}\n`,
      stderr: ``,
      exitCode: 0,
    });
  });
});

it(`should support disabling the network accesses from the environment`, async () => {
  process.env.COREPACK_ENABLE_NETWORK = `0`;

  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@2.2.2`,
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      stdout: ``,
      stderr: expect.stringContaining(`Network access disabled by the environment`),
      exitCode: 1,
    });
  });
});

it(`should support hydrating package managers from cached archives`, async () => {
  await xfs.mktempPromise(async cwd => {
    await expect(runCli(cwd, [`pack`, `yarn@2.2.2`])).resolves.toMatchObject({
      stderr: ``,
      exitCode: 0,
    });

    // Use a new cache
    process.env.COREPACK_HOME = npath.fromPortablePath(await xfs.mktempPromise());

    // Disable the network to make sure we don't succeed by accident
    process.env.COREPACK_ENABLE_NETWORK = `0`;

    await expect(runCli(cwd, [`install`, `-g`, `corepack.tgz`])).resolves.toMatchObject({
      stderr: ``,
      exitCode: 0,
    });

    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@2.2.2`,
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      stdout: `2.2.2\n`,
      stderr: ``,
      exitCode: 0,
    });
  });
});

it(`should support hydrating package managers if cache folder was removed`, async () => {
  await xfs.mktempPromise(async cwd => {
    await expect(runCli(cwd, [`pack`, `yarn@2.2.2`])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
    });

    // Use a new cache
    process.env.COREPACK_HOME = npath.fromPortablePath(await xfs.mktempPromise());

    // Simulate cache removal
    await xfs.removePromise(npath.toPortablePath(process.env.COREPACK_HOME));

    // Disable the network to make sure we don't succeed by accident
    process.env.COREPACK_ENABLE_NETWORK = `0`;

    await expect(runCli(cwd, [`install`, `-g`, `corepack.tgz`])).resolves.toMatchObject({
      stderr: ``,
      exitCode: 0,
    });

    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@2.2.2`,
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      stdout: `2.2.2\n`,
      stderr: ``,
      exitCode: 0,
    });
  });
});

it(`should support hydrating multiple package managers from cached archives`, async () => {
  await xfs.mktempPromise(async cwd => {
    await expect(runCli(cwd, [`pack`, `yarn@2.2.2`, `pnpm@5.8.0`])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
    });

    // Use a new cache
    process.env.COREPACK_HOME = npath.fromPortablePath(await xfs.mktempPromise());

    // Disable the network to make sure we don't succeed by accident
    process.env.COREPACK_ENABLE_NETWORK = `0`;

    await expect(runCli(cwd, [`install`, `-g`, `corepack.tgz`])).resolves.toMatchObject({
      stderr: ``,
      exitCode: 0,
    });

    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@2.2.2`,
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      stdout: `2.2.2\n`,
      stderr: ``,
      exitCode: 0,
    });

    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `pnpm@5.8.0`,
    });

    await expect(runCli(cwd, [`pnpm`, `--version`])).resolves.toMatchObject({
      stdout: `5.8.0\n`,
      stderr: ``,
      exitCode: 0,
    });
  });
}, 180_000);

it(`should support running package managers with bin array`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@2.2.2`,
    });

    await expect(runCli(cwd, [`yarnpkg`, `--version`])).resolves.toMatchObject({
      stdout: `2.2.2\n`,
      stderr: ``,
      exitCode: 0,
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      stdout: `2.2.2\n`,
      stderr: ``,
      exitCode: 0,
    });
  });
});

it(`should handle parallel installs`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@2.2.2`,
    });

    await expect(Promise.all([
      runCli(cwd, [`yarn`, `--version`]),
      runCli(cwd, [`yarn`, `--version`]),
      runCli(cwd, [`yarn`, `--version`]),
    ])).resolves.toMatchObject([
      {
        stdout: `2.2.2\n`,
        stderr: ``,
        exitCode: 0,
      },
      {
        stdout: `2.2.2\n`,
        stderr: ``,
        exitCode: 0,
      },
      {
        stdout: `2.2.2\n`,
        stderr: ``,
        exitCode: 0,
      },
    ]);
  });
});

it(`should not override the package manager exit code`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@2.2.2`,
    });

    const yarnFolder = ppath.join(npath.toPortablePath(folderUtils.getInstallFolder()), `yarn/2.2.2`);
    await xfs.mkdirPromise(yarnFolder, {recursive: true});
    await xfs.writeJsonPromise(ppath.join(yarnFolder, `.corepack`), {});

    await xfs.writeFilePromise(ppath.join(yarnFolder, `yarn.js`), `
      process.exitCode = 42;
    `);

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 42,
      stdout: ``,
      stderr: ``,
    });
  });
});

it(`should not preserve the process.exitCode when a package manager throws`, async () => {
  // Node.js doesn't preserve process.exitCode when an exception is thrown
  // so we need to make sure we don't break this behaviour.

  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@2.2.2`,
    });

    const yarnFolder = ppath.join(npath.toPortablePath(folderUtils.getInstallFolder()), `yarn/2.2.2`);
    await xfs.mkdirPromise(yarnFolder, {recursive: true});
    await xfs.writeJsonPromise(ppath.join(yarnFolder, `.corepack`), {});

    await xfs.writeFilePromise(ppath.join(yarnFolder, `yarn.js`), `
      process.exitCode = 42;
      throw new Error('foo');
    `);

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 1,
      stdout: ``,
      stderr: expect.stringContaining(`foo`),
    });
  });
});

it(`should not set the exit code after successfully launching the package manager`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@2.2.2`,
    });

    const yarnFolder = ppath.join(npath.toPortablePath(folderUtils.getInstallFolder()), `yarn/2.2.2`);
    await xfs.mkdirPromise(yarnFolder, {recursive: true});
    await xfs.writeJsonPromise(ppath.join(yarnFolder, `.corepack`), {});

    await xfs.writeFilePromise(ppath.join(yarnFolder, `yarn.js`), `
      process.once('beforeExit', () => {
        if (process.exitCode === undefined) {
          process.exitCode = 42;
        }
      });
    `);

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 42,
      stdout: ``,
      stderr: ``,
    });
  });
});

it(`should support package managers in ESM format`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@2.2.2`,
    });

    const yarnFolder = ppath.join(npath.toPortablePath(folderUtils.getInstallFolder()), `yarn/2.2.2`);
    await xfs.mkdirPromise(yarnFolder, {recursive: true});
    await xfs.writeJsonPromise(ppath.join(yarnFolder, `.corepack`), {});

    await xfs.writeFilePromise(ppath.join(yarnFolder, `yarn.js`), `
      import 'fs';
      console.log(42);
    `);

    await xfs.writeJsonPromise(ppath.join(yarnFolder, `package.json`), {
      type: `module`,
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stdout: `42\n`,
      stderr: ``,
    });
  });
});

it(`should show a warning on stderr before downloading when enable`, async() => {
  await xfs.mktempPromise(async cwd => {
    process.env.COREPACK_ENABLE_DOWNLOAD_PROMPT = `1`;
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@3.0.0`,
    });
    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stdout: `3.0.0\n`,
      stderr: `! Corepack is about to download https://repo.yarnpkg.com/3.0.0/packages/yarnpkg-cli/bin/yarn.js\n`,
    });
  });
});

it(`should be able to show the latest version`, async () => {
  process.env.COREPACK_DEFAULT_TO_LATEST = `1`;
  await xfs.mktempPromise(async cwd => {
    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stdout: /^1\.\d+\.\d+\r?\n$/,
      stderr: ``,
    });

    // Should keep working if the home folder is removed
    await xfs.rmdirPromise(process.env.COREPACK_HOME as any, {recursive: true});
    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stdout: /^1\.\d+\.\d+\r?\n$/,
      stderr: ``,
    });
  });
});

it(`should download yarn classic from custom registry`, async () => {
  await xfs.mktempPromise(async cwd => {
    process.env.COREPACK_NPM_REGISTRY = `https://registry.npmmirror.com`;
    process.env.COREPACK_ENABLE_DOWNLOAD_PROMPT = `1`;
    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stdout: /^1\.\d+\.\d+\r?\n$/,
      stderr: /^! Corepack is about to download https:\/\/registry\.npmmirror\.com\/yarn\/-\/yarn-1\.\d+\.\d+\.tgz\r?\n$/,
    });

    // Should keep working with cache
    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stdout: /^1\.\d+\.\d+\r?\n$/,
      stderr: ``,
    });
  });
});

it(`should download yarn berry from custom registry`, async () => {
  await xfs.mktempPromise(async cwd => {
    process.env.COREPACK_NPM_REGISTRY = `https://registry.npmmirror.com`;
    process.env.COREPACK_ENABLE_DOWNLOAD_PROMPT = `1`;

    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@3.0.0`,
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stdout: `3.0.0\n`,
      stderr: `! Corepack is about to download https://registry.npmmirror.com/@yarnpkg/cli-dist/-/cli-dist-3.0.0.tgz\n`,
    });

    // Should keep working with cache
    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 0,
      stdout: `3.0.0\n`,
      stderr: ``,
    });
  });
});
