import {Command, Option, UsageError} from 'clipanion';
import path                          from 'path';

import type {Context}                from '../main.ts';
import {runMain}                     from '../main.ts';
import {isNodeError}                 from '../nodeUtils.ts';

export class DirCommand extends Command<Context> {
  static paths = [Command.Default];

  static usage = Command.Usage({
    description: `Run a command from another directory`,
    details: `
      Place \`--dir <path>\` before the command to run it from the specified
      directory. Relative paths are resolved from the current directory.

      This applies to both Corepack commands and package manager invocations.
      Arguments after the package manager name are passed to that manager.
    `,
    examples: [[
      `Install another project's package manager`,
      `corepack --dir ./my-project install`,
    ], [
      `Run pnpm in another project`,
      `corepack --dir ./my-project pnpm install`,
    ]],
  });

  directory = Option.String(`--dir`, {
    required: true,
    description: `The directory in which to run the command`,
  });

  command = Option.Proxy({name: `command`, required: 1});

  async execute() {
    const directory = path.resolve(this.context.cwd, this.directory);
    try {
      process.chdir(directory);
    } catch (error) {
      if (isNodeError(error))
        throw new UsageError(`Couldn't change directory to ${JSON.stringify(directory)}: ${error.message}`);
      throw error;
    }

    await runMain(this.command);
  }
}
