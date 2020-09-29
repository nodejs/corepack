import {Command, UsageError} from 'clipanion';
import fs                    from 'fs';
import path                  from 'path';
import which                 from 'which';

import {Context}             from '../main';

export class EnableCommand extends Command<Context> {
  static usage = Command.Usage({
    description: `Add the Corepack shims to the install directories`,
    details: `
      When run, this commmand will check whether the shims for the specified package managers can be found with the correct values inside the install directory. If not, or if they don't exist, they will be created.

      By default it will locate the install directory by running the equivalent of \`which corepack\`, but this can be tweaked by explicitly passing the install directory via the \`--bin-folder\` flag.
    `,
    examples: [[
      `Enable all shims, putting them next to the \`corepath\` binary`,
      `$0 enable`,
    ], [
      `Enable all shims, putting them in the specified directory`,
      `$0 enable --bin-folder /path/to/folder`,
    ], [
      `Enable the Yarn shim only`,
      `$0 enable yarn`,
    ]],
  });

  @Command.String(`--target`)
  binFolder?: string;

  @Command.Rest()
  names: Array<string> = [];

  @Command.Path(`enable`)
  async execute() {
    let binFolder = this.binFolder;

    // Node always call realpath on the module it executes, so we already
    // lost track of how the binary got called. To find it back, we need to
    // iterate over the PATH variable.
    if (typeof binFolder === `undefined`)
      binFolder = path.dirname(await which(`corepack`));

    if (process.platform === `win32`) {
      return this.executeWin32(binFolder);
    } else {
      return this.executePosix(binFolder);
    }
  }

  async executePosix(binFolder: string) {
    for (const name of this.names) {
      const file = path.join(binFolder, name);
      await fs.promises.unlink(file);
    }
  }

  async executeWin32(target: string) {
    throw new UsageError(`This command isn't available on Windows at this time`);
  }
}
