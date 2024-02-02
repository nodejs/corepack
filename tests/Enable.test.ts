import {Filename, ppath, xfs, npath}                                    from '@yarnpkg/fslib';
import assert                                                           from 'node:assert';
import {delimiter}                                                      from 'node:path';
import process                                                          from 'node:process';
import {describe, beforeEach, it}                                       from 'node:test';

import {Engine}                                                         from '../sources/Engine';
import {SupportedPackageManagers, SupportedPackageManagerSetWithoutNpm} from '../sources/types';

import {makeBin, getBinaryNames}                                        from './_binHelpers';
import {runCli}                                                         from './_runCli';

const engine = new Engine();

beforeEach(async () => {
  process.env.COREPACK_HOME = npath.fromPortablePath(await xfs.mktempPromise());
  process.env.COREPACK_DEFAULT_TO_LATEST = `0`;
});

describe(`EnableCommand`, () => {
  it(`should add the binaries in the folder found in the PATH`, async () => {
    await xfs.mktempPromise(async cwd => {
      const corepackBin = await makeBin(cwd, `corepack` as Filename);

      const PATH = process.env.PATH;
      try {
        process.env.PATH = `${npath.fromPortablePath(cwd)}${delimiter}${PATH}`;
        const {stdout, stderr, exitCode} = await runCli(cwd, [`enable`]);
        assert.deepStrictEqual({stdout, stderr, exitCode}, {
          stdout: ``,
          stderr: ``,
          exitCode: 0,
        });
      } finally {
        process.env.PATH = PATH;
      }

      const sortedEntries = xfs.readdirPromise(cwd).then(entries => {
        return entries.sort();
      });

      const expectedEntries: Array<string> = [ppath.basename(corepackBin)];
      for (const packageManager of SupportedPackageManagerSetWithoutNpm)
        for (const binName of engine.getBinariesFor(packageManager))
          expectedEntries.push(...getBinaryNames(binName));

      assert.deepStrictEqual(await sortedEntries, expectedEntries.sort());
    });
  });

  it(`should add the binaries to the specified folder when using --install-directory`, async () => {
    await xfs.mktempPromise(async cwd => {
      const corepackBin = await makeBin(cwd, `corepack` as Filename);

      const {stdout, stderr, exitCode} = await runCli(cwd, [`enable`, `--install-directory`, npath.fromPortablePath(cwd)]);
      assert.deepStrictEqual({stdout, stderr, exitCode}, {
        stdout: ``,
        stderr: ``,
        exitCode: 0,
      });

      const sortedEntries = xfs.readdirPromise(cwd).then(entries => {
        return entries.sort();
      });

      const expectedEntries: Array<string> = [ppath.basename(corepackBin)];
      for (const packageManager of SupportedPackageManagerSetWithoutNpm)
        for (const binName of engine.getBinariesFor(packageManager))
          expectedEntries.push(...getBinaryNames(binName));

      assert.deepStrictEqual(await sortedEntries, expectedEntries.sort());
    });
  });

  it(`should add binaries only for the requested package managers`, async () => {
    await xfs.mktempPromise(async cwd => {
      const corepackBin = await makeBin(cwd, `corepack` as Filename);

      const PATH = process.env.PATH;
      try {
        process.env.PATH = `${npath.fromPortablePath(cwd)}${delimiter}${PATH}`;
        const {stdout, stderr, exitCode} = await runCli(cwd, [`enable`, `yarn`]);
        assert.deepStrictEqual({stdout, stderr, exitCode}, {
          stdout: ``,
          stderr: ``,
          exitCode: 0,
        });
      } finally {
        process.env.PATH = PATH;
      }

      const sortedEntries = xfs.readdirPromise(cwd).then(entries => {
        return entries.sort();
      });

      const expectedEntries: Array<string> = [ppath.basename(corepackBin)];
      for (const binName of engine.getBinariesFor(SupportedPackageManagers.Yarn))
        expectedEntries.push(...getBinaryNames(binName));

      assert.deepStrictEqual(await sortedEntries, expectedEntries.sort());
    });
  });
});
