import {Command}          from 'clipanion';
import fs                 from 'fs';
import path               from 'path';
import semver             from 'semver';

import * as debugUtils    from '../debugUtils';
import {getInstallFolder} from '../folderUtils';
import type {Context}     from '../main';
import type {NodeError}   from '../nodeUtils';
import {parseSpec}        from '../specUtils';

export class CleanupCommand extends Command<Context> {
  static paths = [
    [`cleanup`],
  ];

  static usage = Command.Usage({
    description: `Cleans Corepack cache`,
    details: `
      When run, this commmand will check what are the versions required by the package.json files it knows of, and remove from the cache all the versions that are in used.
    `,
  });

  async execute() {
    const installFolder = getInstallFolder();
    const listFile = await fs.promises.open(path.join(installFolder, `packageJsonList.json`), `r+`);

    const previousList = JSON.parse(await listFile.readFile(`utf8`)) as Array<string>;
    const listFilteredOffOfInvalidManifests = new Set<string>();
    const inusedSpecs = [];

    for (const pkgPath of previousList) {
      let pkgContent: string;
      try {
        pkgContent = await fs.promises.readFile(pkgPath, `utf8`);
      } catch (err) {
        if ((err as NodeError)?.code === `ENOENT`)
          continue;

        throw err;
      }
      let packageManager: string;
      try {
        packageManager = JSON.parse(pkgContent).packageManager;
      } catch {
        continue;
      }

      if (!packageManager) continue;

      try {
        inusedSpecs.push(parseSpec(packageManager, pkgPath));
        listFilteredOffOfInvalidManifests.add(pkgPath);
      } catch {
        continue;
      }
    }

    await listFile.truncate(0);
    await listFile.write(JSON.stringify(Array.from(listFilteredOffOfInvalidManifests)), 0);
    await listFile.close();

    const cacheDir = await fs.promises.opendir(path.join(installFolder));
    const deletionPromises = [];
    for await (const dirent of cacheDir) {
      if (!dirent.isDirectory() || dirent.name[0] === `.`) continue;
      deletionPromises.push(this.cleanUpCacheFolder(
        path.join(installFolder, dirent.name),
        inusedSpecs.flatMap(spec => spec.name === dirent.name ? spec.range : []),
      ));
    }
    await Promise.all(deletionPromises);
  }

  async cleanUpCacheFolder(dirPath: string, ranges: Array<string>) {
    const dirIterator = await fs.promises.opendir(dirPath);
    const deletionPromises = [];
    for await (const dirent of dirIterator) {
      if (!dirent.isDirectory() || dirent.name[0] === `.`) continue;
      const p = path.join(dirPath, dirent.name);
      if (ranges.every(range => !semver.satisfies(dirent.name, range))) {
        debugUtils.log(`Removing ${p}`);
        deletionPromises.push(fs.promises.rm(p));
      } else {
        debugUtils.log(`Keeping ${p}`);
      }
    }
    await Promise.all(deletionPromises);
  }
}
