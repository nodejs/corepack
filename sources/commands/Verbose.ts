import {Command, Option} from 'clipanion';

import {runMain}         from '../main.ts';

import {BaseCommand}     from './Base.ts';

export class VerboseCommand extends BaseCommand {
  static paths = [[`--verbose`]];

  static usage = Command.Usage({
    description: `Run a command with Corepack diagnostics`,
    details: `
      Place \`--verbose\` before a package manager name to print Corepack
      diagnostics on stderr. Arguments after the package manager name are
      passed to that manager.
    `,
    examples: [[
      `Show Corepack diagnostics when running pnpm`,
      `corepack --verbose pnpm install`,
    ]],
  });

  // The flag is consumed as this command's path.
  verbose = true;

  command = Option.Proxy({name: `command`});

  async execute() {
    await runMain(this.command);
  }
}
