import {Command, UsageError}                                   from 'clipanion';
import fs                                                      from 'fs';
import path                                                    from 'path';
import which                                                   from 'which';

import {Context}                                               from '../main';
import {isSupportedPackageManager, SupportedPackageManagerSet} from '../types';

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

  @Command.String(`--install-directory`)
  installDirectory?: string;

  @Command.Rest()
  names: Array<string> = [];

  @Command.Path(`enable`)
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
    // We use `eval` so that Webpack doesn't statically transform it.
    const manifestPath = eval(`require`).resolve(`corepack/package.json`);

    const stubFolder = path.join(path.dirname(manifestPath), `shims`);
    if (!fs.existsSync(stubFolder))
      throw new Error(`Assertion failed: The stub folder doesn't exist`);

    const names = this.names.length === 0
      ? SupportedPackageManagerSet
      : this.names;

    for (const name of new Set(names)) {
      if (!isSupportedPackageManager(name))
        throw new UsageError(`Invalid package manager name '${name}'`);

      for (const binName of this.context.engine.getBinariesFor(name)) {
        const file = path.join(installDirectory, binName);
        const symlink = path.relative(installDirectory, path.join(stubFolder, binName));

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
  }

  async executeWin32(target: string) {
    throw new UsageError(`This command isn't available on Windows at this time`);
  }
}
