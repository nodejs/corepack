import {Command, UsageError} from 'clipanion';
import fs                    from 'fs';
import path                  from 'path';
import which                 from 'which';

import {Context}             from '../main';

export class DisableCommand extends Command<Context> {
  static usage = Command.Usage({
    description: `Remove the Corepack shims from the install directory`,
    details: `
      When run, this command will remove the shims for the specified package managers from the install directory, or all shims if no parameters are passed.

      By default it will locate the install directory by running the equivalent of \`which corepack\`, but this can be tweaked by explicitly passing the install directory via the \`--bin-folder\` flag.
    `,
    examples: [[
      `Disable all shims, removing them if they're next to the \`coreshim\` binary`,
      `$0 disable`,
    ], [
      `Disable all shims, removing them from the specified directory`,
      `$0 disable --bin-folder /path/to/bin`,
    ], [
      `Disable the Yarn shim only`,
      `$0 disable yarn`,
    ]],
  });

  @Command.String(`--target`)
  binFolder?: string;

  @Command.Rest()
  names: Array<string> = [];

  @Command.Path(`disable`)
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
    // We use `eval` so that Webpack doesn't statically transform it.
    const stubFolder = path.dirname(eval(`__dirname`));

    for (const name of this.names) {
      const file = path.join(binFolder, name);
      const symlink = path.relative(binFolder, path.join(stubFolder, name));

      if (fs.existsSync(file)) {
        const currentSymlink = await fs.promises.readlink(file);
        if (currentSymlink !== symlink) {
          await fs.promises.unlink(file);
        } else {
          return;
        }
      }

      await fs.promises.symlink(symlink, file);
    }
  }

  async executeWin32(target: string) {
    throw new UsageError(`This command isn't available on Windows at this time`);
  }
}
