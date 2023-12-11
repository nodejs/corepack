import {beforeEach, it, expect}                    from '@jest/globals';
import {Filename, ppath, xfs, npath, PortablePath} from '@yarnpkg/fslib';
import process                                     from 'node:process';

import config                                      from '../config.json';

import {runCli}                                    from './_runCli';

let corepackHome!: PortablePath;

beforeEach(async () => {
  corepackHome = await xfs.mktempPromise();

  process.env.COREPACK_HOME = npath.fromPortablePath(corepackHome);
  process.env.COREPACK_DEFAULT_TO_LATEST = `0`;
});

it(`should refuse to download a package manager if the hash doesn't match`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@1.22.4+sha1.deadbeef`,
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 1,
      stderr: ``,
      stdout: /Mismatch hashes/,
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
      stderr: ``,
      stdout: /expected a semver version/,
    });

    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@stable`,
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 1,
      stderr: ``,
      stdout: /expected a semver version/,
    });

    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@^1.0.0`,
    });

    await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
      exitCode: 1,
      stderr: ``,
      stdout: /expected a semver version/,
    });
  });
});

const testedPackageManagers: Array<[string, string]> = [
  [`yarn`, `1.22.4`],
  [`yarn`, `1.22.4+sha1.01c1197ca5b27f21edc8bc472cd4c8ce0e5a470e`],
  [`yarn`, `1.22.4+sha224.0d6eecaf4d82ec12566fdd97143794d0f0c317e0d652bd4d1b305430`],
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

for (const [name, version] of testedPackageManagers) {
  it(`should use the right package manager version for a given project (${name}@${version})`, async () => {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
        packageManager: `${name}@${version}`,
      });

      await expect(runCli(cwd, [name, `--version`])).resolves.toMatchObject({
        exitCode: 0,
        stderr: ``,
        stdout: `${version.split(`+`, 1)[0]}\n`,
      });
    });
  });
}

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
      stderr: ``,
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

it(`should use the pinned version when local projects don't list any spec`, async () => {
  // Note that we don't prevent using any package manager. This ensures that
  // projects will receive as little disruption as possible (for example, we
  // don't prompt to set the packageManager field).

  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      // empty package.json file
    });

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

    await expect(runCli(cwd, [`npm`, `--version`])).resolves.toMatchObject({
      stdout: `${config.definitions.npm.default.split(`+`, 1)[0]}\n`,
      stderr: ``,
      exitCode: 0,
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
      stderr: ``,
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
      stderr: ``,
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
      stderr: ``,
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

    try {
      await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
        stdout: `1.0.0\n`,
        stderr: ``,
        exitCode: 0,
      });
    } finally {
      delete process.env.COREPACK_ENABLE_NETWORK;
    }
  });
});

it(`should refuse to run a different package manager within a configured project`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@1.0.0`,
    });

    process.env.FORCE_COLOR = `0`;

    await expect(runCli(cwd, [`pnpm`, `--version`])).resolves.toMatchObject({
      stdout: `Usage Error: This project is configured to use yarn\n\n$ pnpm ...\n`,
      exitCode: 1,
    });

    // Disable strict checking to workaround the UsageError.
    process.env.COREPACK_ENABLE_STRICT = `0`;

    try {
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
    } finally {
      delete process.env.COREPACK_ENABLE_STRICT;
      delete process.env.FORCE_COLOR;
    }
  });
});


it(`should always use fallback version when project spec env is disabled`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      packageManager: `yarn@1.0.0`,
    });
    process.env.COREPACK_ENABLE_PROJECT_SPEC = `0`;

    try {
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
    } finally {
      delete process.env.COREPACK_ENABLE_PROJECT_SPEC;
    }
  });
});

it(`should allow to call "corepack install -g --all" to prepare all package managers`, async () => {
  await xfs.mktempPromise(async cwd => {
    await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
      // empty package.json file
    });

    await expect(runCli(cwd, [`install`, `-g`, `--all`])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
    });

    process.env.COREPACK_ENABLE_NETWORK = `0`;

    try {
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

      await expect(runCli(cwd, [`npm`, `--version`])).resolves.toMatchObject({
        stdout: `${config.definitions.npm.default.split(`+`, 1)[0]}\n`,
        stderr: ``,
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

      await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
        stdout: expect.stringContaining(`Network access disabled by the environment`),
        stderr: ``,
        exitCode: 1,
      });
    });
  } finally {
    delete process.env.COREPACK_ENABLE_NETWORK;
  }
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

    try {
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
    } finally {
      delete process.env.COREPACK_ENABLE_NETWORK;
    }
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

    try {
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
    } finally {
      delete process.env.COREPACK_ENABLE_NETWORK;
    }
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

    try {
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

    const yarnFolder = ppath.join(corepackHome, `yarn/2.2.2`);
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

    const yarnFolder = ppath.join(corepackHome, `yarn/2.2.2`);
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

    const yarnFolder = ppath.join(corepackHome, `yarn/2.2.2`);
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

    const yarnFolder = ppath.join(corepackHome, `yarn/2.2.2`);
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
