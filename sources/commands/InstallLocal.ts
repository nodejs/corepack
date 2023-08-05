import {Command, UsageError} from 'clipanion';

import {BaseCommand}         from './Base';

export class InstallLocalCommand extends BaseCommand {
  static paths = [
    [`install`],
  ];

  static usage = Command.Usage({
    description: `Install the package manager configured in the local project`,
    details: `
      Download and install the package manager configured in the local project. This command doesn't change the global version used when running the package manager from outside the project (use the \`-g,--global\` flag if you wish to do this).
    `,
    examples: [[
      `Install the project's package manager in the cache`,
      `corepack install`,
    ]],
  });

  async execute() {
    const [descriptor] = await this.resolvePatternsToDescriptors({
      all: false,
      patterns: [],
    });

    const resolved = await this.context.engine.resolveDescriptor(descriptor, {allowTags: true});
    if (resolved === null)
      throw new UsageError(`Failed to successfully resolve '${descriptor.range}' to a valid ${descriptor.name} release`);

    this.context.stdout.write(`Adding ${resolved.name}@${resolved.reference} to the cache...\n`);
    await this.context.engine.ensurePackageManager(resolved);
  }
}
