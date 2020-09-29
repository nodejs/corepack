import {Filename, ppath, xfs, npath, PortablePath} from '@yarnpkg/fslib';
import {delimiter}                                 from 'path';

import {Engine}                                    from '../sources/Engine';
import {SupportedPackageManagerSet}                from '../sources/types';

import {runCli}                                    from './_runCli';

const engine = new Engine();

beforeEach(async () => {
  process.env.COREPACK_HOME = await xfs.mktempPromise();
});

async function makeBin(cwd: PortablePath, name: Filename) {
  const path = ppath.join(cwd, name);

  await xfs.writeFilePromise(path, ``);
  await xfs.chmodPromise(path, 0o755);
}

describe(`DisableCommand`, () => {
  it(`should remove the binaries from the folder found in the PATH`, async () => {
    await xfs.mktempPromise(async cwd => {
      await makeBin(cwd, `corepack` as Filename);
      await makeBin(cwd, `dont-remove` as Filename);

      for (const packageManager of SupportedPackageManagerSet)
        for (const binName of engine.getBinariesFor(packageManager))
          await makeBin(cwd, binName as Filename);

      const PATH = process.env.PATH;
      try {
        process.env.PATH = `${npath.fromPortablePath(cwd)}${delimiter}${PATH}`;
        await expect(runCli(cwd, [`disable`])).resolves.toMatchObject({
          exitCode: 0,
        });
      } finally {
        process.env.PATH = PATH;
      }

      const sortedEntries = xfs.readdirPromise(cwd).then(entries => {
        return entries.sort();
      });

      await expect(sortedEntries).resolves.toEqual([
        `corepack`,
        `dont-remove`,
      ]);
    });
  });

  it(`should remove the binaries from the specified folder when used with --install-directory`, async () => {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeFilePromise(ppath.join(cwd, `dont-remove` as Filename), ``);

      for (const packageManager of SupportedPackageManagerSet)
        for (const binName of engine.getBinariesFor(packageManager))
          await makeBin(cwd, binName as Filename);

      await expect(runCli(cwd, [`disable`, `--install-directory`, npath.fromPortablePath(cwd)])).resolves.toMatchObject({
        exitCode: 0,
      });

      await expect(xfs.readdirPromise(cwd)).resolves.toEqual([
        `dont-remove`,
      ]);
    });
  });

  it(`should remove binaries only for the requested package managers`, async () => {
    await xfs.mktempPromise(async cwd => {
      const binNames = new Set<string>();

      await makeBin(cwd, `corepack` as Filename);
      binNames.add(`corepack`);

      await makeBin(cwd, `dont-remove` as Filename);
      binNames.add(`dont-remove`);

      for (const packageManager of SupportedPackageManagerSet)
        for (const binName of engine.getBinariesFor(packageManager))
          binNames.add(binName);

      for (const binName of binNames)
        await makeBin(cwd, binName as Filename);

      const PATH = process.env.PATH;
      try {
        process.env.PATH = `${npath.fromPortablePath(cwd)}${delimiter}${PATH}`;
        await expect(runCli(cwd, [`disable`, `yarn`])).resolves.toMatchObject({
          exitCode: 0,
        });
      } finally {
        process.env.PATH = PATH;
      }

      binNames.delete(`yarn`);
      binNames.delete(`yarnpkg`);

      const sortedEntries = xfs.readdirPromise(cwd).then(entries => {
        return entries.sort();
      });

      await expect(sortedEntries).resolves.toEqual([...binNames].sort());
    });
  });
});
