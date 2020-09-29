import {Filename, ppath, xfs, npath, PortablePath}            from '@yarnpkg/fslib';
import {delimiter}                                            from 'path';

import {Engine}                                               from '../sources/Engine';
import {SupportedPackageManagerSet, SupportedPackageManagers} from '../sources/types';

import {runCli}                                               from './_runCli';

const engine = new Engine();

beforeEach(async () => {
  process.env.COREPACK_HOME = await xfs.mktempPromise();
});

async function makeBin(cwd: PortablePath, name: Filename) {
  const path = ppath.join(cwd, name);

  await xfs.writeFilePromise(path, ``);
  await xfs.chmodPromise(path, 0o755);
}

describe(`EnableCommand`, () => {
  it(`should add the binaries in the folder found in the PATH`, async () => {
    await xfs.mktempPromise(async cwd => {
      await makeBin(cwd, `corepack` as Filename);

      const PATH = process.env.PATH;
      try {
        process.env.PATH = `${npath.fromPortablePath(cwd)}${delimiter}${PATH}`;
        await expect(runCli(cwd, [`enable`])).resolves.toMatchObject({
          exitCode: 0,
        });
      } finally {
        process.env.PATH = PATH;
      }

      const sortedEntries = xfs.readdirPromise(cwd).then(entries => {
        return entries.sort();
      });

      const expectedEntries = [`corepack`];
      for (const packageManager of SupportedPackageManagerSet)
        for (const binName of engine.getBinariesFor(packageManager))
          expectedEntries.push(binName);

      await expect(sortedEntries).resolves.toEqual(expectedEntries.sort());
    });
  });

  it(`should add the binaries to the specified folder when using --install-directory`, async () => {
    await xfs.mktempPromise(async cwd => {
      await makeBin(cwd, `corepack` as Filename);

      await expect(runCli(cwd, [`enable`, `--install-directory`, npath.fromPortablePath(cwd)])).resolves.toMatchObject({
        exitCode: 0,
      });

      const sortedEntries = xfs.readdirPromise(cwd).then(entries => {
        return entries.sort();
      });

      const expectedEntries = [`corepack`];
      for (const packageManager of SupportedPackageManagerSet)
        for (const binName of engine.getBinariesFor(packageManager))
          expectedEntries.push(binName);

      await expect(sortedEntries).resolves.toEqual(expectedEntries.sort());
    });
  });

  it(`should add binaries only for the requested package managers`, async () => {
    await xfs.mktempPromise(async cwd => {
      await makeBin(cwd, `corepack` as Filename);

      const PATH = process.env.PATH;
      try {
        process.env.PATH = `${npath.fromPortablePath(cwd)}${delimiter}${PATH}`;
        await expect(runCli(cwd, [`enable`, `yarn`])).resolves.toMatchObject({
          exitCode: 0,
        });
      } finally {
        process.env.PATH = PATH;
      }

      const sortedEntries = xfs.readdirPromise(cwd).then(entries => {
        return entries.sort();
      });

      const expectedEntries = [`corepack`];
      for (const binName of engine.getBinariesFor(SupportedPackageManagers.Yarn))
        expectedEntries.push(binName);

      await expect(sortedEntries).resolves.toEqual(expectedEntries.sort());
    });
  });
});
