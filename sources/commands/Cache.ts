import {Command}          from 'clipanion';
import fs                 from 'fs';

import * as debugUtils    from '../debugUtils.ts';
import {getInstallFolder} from '../folderUtils.ts';
import {isNodeError}      from '../nodeUtils.ts';

import {BaseCommand}      from './Base.ts';

export class CacheCommand extends BaseCommand {
  static paths = [
    [`cache`, `clean`],
    [`cache`, `clear`],
  ];

  static usage = Command.Usage({
    description: `Cleans Corepack cache`,
    details: `
      Removes Corepack cache directory from your local disk.
    `,
  });

  async execute() {
    const folder = getInstallFolder();
    try {
      await fs.promises.lstat(folder);
    } catch (error) {
      if (isNodeError(error) && error.code === `ENOENT`) {
        debugUtils.log(`Package manager cache does not exist at ${folder}`);
        return;
      }
      throw error;
    }

    debugUtils.log(`Removing package manager cache at ${folder}`);
    await fs.promises.rm(folder, {recursive: true, force: true});
    debugUtils.log(`Finished cleaning package manager cache at ${folder}`);
  }
}
