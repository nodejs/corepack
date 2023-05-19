import {describe, beforeEach, it, expect}     from '@jest/globals';
import {Filename, ppath, xfs, npath}          from '@yarnpkg/fslib';
import {delimiter}                            from 'node:path';
import process                                from 'node:process';

import {Engine}                               from '../sources/Engine';
import {SupportedPackageManagerSetWithoutNpm} from '../sources/types';

import {makeBin, getBinaryNames}              from './_binHelpers';
import {runCli}                               from './_runCli';

const engine = new Engine();

beforeEach(async () => {
  process.env.COREPACK_HOME = npath.fromPortablePath(await xfs.mktempPromise());
});

describe(`DisableCommand`, () => {
  it(`should remove the binaries from the folder found in the PATH`, async () => {
    await xfs.mktempPromise(async cwd => {
      const corepackBin = await makeBin(cwd, `corepack` as Filename);
      const dontRemoveBin = await makeBin(cwd, `dont-remove` as Filename);

      for (const packageManager of SupportedPackageManagerSetWithoutNpm)
        for (const binName of engine.getBinariesFor(packageManager))
          for (const variant of getBinaryNames(binName))
            await makeBin(cwd, variant as Filename, {ignorePlatform: true});

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
        ppath.basename(corepackBin),
        ppath.basename(dontRemoveBin),
      ]);
    });
  });

  it(`should remove the binaries from the specified folder when used with --install-directory`, async () => {
    await xfs.mktempPromise(async cwd => {
      const dontRemoveBin = await makeBin(cwd, `dont-remove` as Filename);

      for (const packageManager of SupportedPackageManagerSetWithoutNpm)
        for (const binName of engine.getBinariesFor(packageManager))
          for (const variant of getBinaryNames(binName))
            await makeBin(cwd, variant as Filename, {ignorePlatform: true});

      await expect(runCli(cwd, [`disable`, `--install-directory`, npath.fromPortablePath(cwd)])).resolves.toMatchObject({
        exitCode: 0,
      });

      await expect(xfs.readdirPromise(cwd)).resolves.toEqual([
        ppath.basename(dontRemoveBin),
      ]);
    });
  });

  it(`should remove binaries only for the requested package managers`, async () => {
    await xfs.mktempPromise(async cwd => {
      const binNames = new Set<string>();

      for (const packageManager of SupportedPackageManagerSetWithoutNpm)
        for (const binName of engine.getBinariesFor(packageManager))
          for (const variant of getBinaryNames(binName))
            binNames.add(variant);

      for (const binName of binNames)
        await makeBin(cwd, binName as Filename, {ignorePlatform: true});

      const corepackBin = await makeBin(cwd, `corepack` as Filename);
      binNames.add(ppath.basename(corepackBin));

      const dontRemoveBin = await makeBin(cwd, `dont-remove` as Filename);
      binNames.add(ppath.basename(dontRemoveBin));

      const PATH = process.env.PATH;
      try {
        process.env.PATH = `${npath.fromPortablePath(cwd)}${delimiter}${PATH}`;
        await expect(runCli(cwd, [`disable`, `yarn`])).resolves.toMatchObject({
          exitCode: 0,
        });
      } finally {
        process.env.PATH = PATH;
      }

      for (const variant of getBinaryNames(`yarn`))
        binNames.delete(variant);
      for (const variant of getBinaryNames(`yarnpkg`))
        binNames.delete(variant);

      const sortedEntries = xfs.readdirPromise(cwd).then(entries => {
        return entries.sort();
      });

      await expect(sortedEntries).resolves.toEqual([...binNames].sort());
    });
  });
});
