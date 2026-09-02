import type {Filename}          from '@yarnpkg/fslib';
import {npath, ppath, xfs}      from '@yarnpkg/fslib';
import process                  from 'node:process';
import {beforeEach, expect, it} from 'vitest';

import {runCli}                 from './_runCli.ts';


beforeEach(async () => {
  const home = await xfs.mktempPromise();
  process.env.COREPACK_HOME = npath.fromPortablePath(home);

  return async () => {
    await xfs.removePromise(home, {recursive: true});
  };
});

for (const command of [`clean`, `clear`]) {
  it(`should remove the entire cache with cache ${command}`, async () => {
    const home = npath.toPortablePath(process.env.COREPACK_HOME!);
    await xfs.mkdirPromise(ppath.join(home, `v1`), {recursive: true});
    await xfs.writeFilePromise(ppath.join(home, `v1/package-manager` as Filename), ``);
    await xfs.writeJsonPromise(ppath.join(home, `lastKnownGood.json` as Filename), {
      yarn: `4.0.0`,
    });

    await expect(runCli(home, [`cache`, command])).resolves.toMatchObject({
      exitCode: 0,
      stderr: ``,
      stdout: ``,
    });

    await expect(xfs.readdirPromise(home)).resolves.toEqual([]);
  });
}
