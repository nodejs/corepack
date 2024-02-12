import {Command}          from 'clipanion';
import fs                 from 'fs';

import {getInstallFolder} from '../folderUtils';
import type {Context}     from '../main';

export class CacheCommand extends Command<Context> {
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
    await fs.promises.rm(getInstallFolder(), {recursive: true, force: true});
  }
}
