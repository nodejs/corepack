import {Filename, ppath, xfs, npath}                                    from '@yarnpkg/fslib';
import {delimiter}                                                      from 'node:path';
import process                                                          from 'node:process';
import {describe, beforeEach, it, expect, test}                         from 'vitest';

import {Engine}                                                         from '../sources/Engine';
import {SupportedPackageManagers, SupportedPackageManagerSetWithoutNpm} from '../sources/types';

import {makeBin, getBinaryNames}                                        from './_binHelpers';
import {runCli}                                                         from './_runCli';

const engine = new Engine();

beforeEach(async () => {
  // `process.env` is reset after each tests in setupTests.js.
  process.env.COREPACK_HOME = npath.fromPortablePath(await xfs.mktempPromise());
  process.env.COREPACK_DEFAULT_TO_LATEST = `0`;
});

describe(`EnableCommand`, () => {
  it(`should add the binaries in the folder found in the PATH`, async () => {
    await xfs.mktempPromise(async cwd => {
      const corepackBin = await makeBin(cwd, `corepack` as Filename);

      process.env.PATH = `${npath.fromPortablePath(cwd)}${delimiter}${process.env.PATH}`;
      await expect(runCli(cwd, [`enable`])).resolves.toMatchObject({
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

      await expect(sortedEntries).resolves.toEqual(expectedEntries.sort());
    });
  });

  it(`should add the binaries to the specified folder when using --install-directory`, async () => {
    await xfs.mktempPromise(async cwd => {
      const corepackBin = await makeBin(cwd, `corepack` as Filename);

      await expect(runCli(cwd, [`enable`, `--install-directory`, npath.fromPortablePath(cwd)])).resolves.toMatchObject({
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

      await expect(sortedEntries).resolves.toEqual(expectedEntries.sort());
    });
  });

  it(`should add binaries only for the requested package managers`, async () => {
    await xfs.mktempPromise(async cwd => {
      const corepackBin = await makeBin(cwd, `corepack` as Filename);

      process.env.PATH = `${npath.fromPortablePath(cwd)}${delimiter}${process.env.PATH}`;
      await expect(runCli(cwd, [`enable`, `yarn`])).resolves.toMatchObject({
        stdout: ``,
        stderr: ``,
        exitCode: 0,
      });

      const sortedEntries = xfs.readdirPromise(cwd).then(entries => {
        return entries.sort();
      });

      const expectedEntries: Array<string> = [ppath.basename(corepackBin)];
      for (const binName of engine.getBinariesFor(SupportedPackageManagers.Yarn))
        expectedEntries.push(...getBinaryNames(binName));

      await expect(sortedEntries).resolves.toEqual(expectedEntries.sort());
    });
  });

  test.skipIf(process.platform === `win32`)(`should overwrite existing files`, async () => {
    await xfs.mktempPromise(async cwd => {
      await xfs.writeFilePromise(ppath.join(cwd, `yarn`), `hello`);

      process.env.PATH = `${npath.fromPortablePath(cwd)}${delimiter}${process.env.PATH}`;
      await expect(runCli(cwd, [`enable`, `--install-directory`, npath.fromPortablePath(cwd)])).resolves.toMatchObject({
        stdout: ``,
        stderr: ``,
        exitCode: 0,
      });

      const file = await xfs.readFilePromise(ppath.join(cwd, `yarn`), `utf8`);
      expect(file).not.toBe(`hello`);
    });
  });

  test.skipIf(process.platform === `win32`)(`shouldn't overwrite Yarn files if they are in a /switch/ folder`, async () => {
    await xfs.mktempPromise(async cwd => {
      await xfs.mkdirPromise(ppath.join(cwd, `switch/bin`), {recursive: true});
      await xfs.writeFilePromise(ppath.join(cwd, `switch/bin/yarn`), `hello`);

      await xfs.symlinkPromise(
        ppath.join(cwd, `switch/bin/yarn`),
        ppath.join(cwd, `yarn`),
      );

      process.env.PATH = `${npath.fromPortablePath(cwd)}${delimiter}${process.env.PATH}`;
      await expect(runCli(cwd, [`enable`, `--install-directory`, npath.fromPortablePath(cwd)])).resolves.toMatchObject({
        stdout: ``,
        stderr: expect.stringMatching(/^yarn is already installed in .+ and points to a Yarn Switch install - skipping\n$/),
        exitCode: 0,
      });

      const file = await xfs.readFilePromise(ppath.join(cwd, `yarn`), `utf8`);
      expect(file).toBe(`hello`);
    });
  });
});
