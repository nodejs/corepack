import cmdShim                                                           from '@zkochan/cmd-shim';
import {Command, Option, UsageError}                                     from 'clipanion';
import fs                                                                from 'fs';
import path                                                              from 'path';
import which                                                             from 'which';

import {Context}                                                         from '../main';
import {isSupportedPackageManager, SupportedPackageManagerSetWithoutNpm} from '../types';

export class EnableCommand extends Command<Context> {
  static paths = [
    [`enable`],
  ];

  static usage = Command.Usage({
    description: `Add the Corepack shims to the install directories`,
    details: `
      When run, this commmand will check whether the shims for the specified package managers can be found with the correct values inside the install directory. If not, or if they don't exist, they will be created.

      By default it will locate the install directory by running the equivalent of \`which corepack\`, but this can be tweaked by explicitly passing the install directory via the \`--install-directory\` flag.
    `,
    examples: [[
      `Enable all shims, putting them next to the \`corepack\` binary`,
      `$0 enable`,
    ], [
      `Enable all shims, putting them in the specified directory`,
      `$0 enable --install-directory /path/to/folder`,
    ], [
      `Enable the Yarn shim only`,
      `$0 enable yarn`,
    ]],
  });

  installDirectory = Option.String(`--install-directory`, {
    description: `Where the shims are to be installed`,
  });

  names = Option.Rest();

  async execute() {
    let installDirectory = this.installDirectory;

    // Node always call realpath on the module it executes, so we already
    // lost track of how the binary got called. To find it back, we need to
    // iterate over the PATH variable.
    if (typeof installDirectory === `undefined`)
      installDirectory = path.dirname(await which(`corepack`));

    // Otherwise the relative symlink we'll compute will be incorrect, if the
    // install directory is within a symlink
    installDirectory = fs.realpathSync(installDirectory);

    const manifestPath = require.resolve(`corepack/package.json`);

    const distFolder = path.join(path.dirname(manifestPath), `dist`);
    if (!fs.existsSync(distFolder))
      throw new Error(`Assertion failed: The stub folder doesn't exist`);

    const names = this.names.length === 0
      ? SupportedPackageManagerSetWithoutNpm
      : this.names;

    for (const name of new Set(names)) {
      if (!isSupportedPackageManager(name))
        throw new UsageError(`Invalid package manager name '${name}'`);

      for (const binName of this.context.engine.getBinariesFor(name)) {
        if (process.platform === `win32`) {
          await this.generateWin32Link(installDirectory, distFolder, binName);
        } else {
          await this.generatePosixLink(installDirectory, distFolder, binName);
        }
      }
    }
  }

  async generatePosixLink(installDirectory: string, distFolder: string, binName: string) {
    const file = path.join(installDirectory, binName);
    const symlink = path.relative(installDirectory, path.join(distFolder, `${binName}.js`));

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

  async generateWin32Link(installDirectory: string, distFolder: string, binName: string) {
    const file = path.join(installDirectory, binName);
    await cmdShim(path.join(distFolder, `${binName}.js`), file, {
      createCmdFile: true,
    });
  }
}
