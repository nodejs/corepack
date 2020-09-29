import {Command, UsageError}                                   from 'clipanion';
import fs                                                      from 'fs';
import path                                                    from 'path';
import which                                                   from 'which';

import {Context}                                               from '../main';
import {isSupportedPackageManager, SupportedPackageManagerSet} from '../types';

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
      `$0 disable --install-directory /path/to/bin`,
    ], [
      `Disable the Yarn shim only`,
      `$0 disable yarn`,
    ]],
  });

  @Command.String(`--install-directory`)
  installDirectory?: string;

  @Command.Rest()
  names: Array<string> = [];

  @Command.Path(`disable`)
  async execute() {
    let installDirectory = this.installDirectory;

    // Node always call realpath on the module it executes, so we already
    // lost track of how the binary got called. To find it back, we need to
    // iterate over the PATH variable.
    if (typeof installDirectory === `undefined`)
      installDirectory = path.dirname(await which(`corepack`));

    if (process.platform === `win32`) {
      return this.executeWin32(installDirectory);
    } else {
      return this.executePosix(installDirectory);
    }
  }

  async executePosix(installDirectory: string) {
    const names = this.names.length === 0
      ? SupportedPackageManagerSet
      : this.names;

    for (const name of new Set(names)) {
      if (!isSupportedPackageManager(name))
        throw new UsageError(`Invalid package manager name '${name}'`);

      for (const binName of this.context.engine.getBinariesFor(name)) {
        const file = path.join(installDirectory, binName);
        try {
          await fs.promises.unlink(file);
        } catch (err) {
          if (err.code !== `ENOENT`) {
            throw err;
          }
        }
      }
    }
  }

  async executeWin32(installDirectory: string) {
    throw new UsageError(`This command isn't available on Windows at this time`);
  }
}
