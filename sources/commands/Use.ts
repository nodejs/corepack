import {Command, Option, UsageError} from 'clipanion';

import {BaseCommand}                 from './Base';

export class UseCommand extends BaseCommand {
  static paths = [
    [`use`],
  ];

  static usage = Command.Usage({
    description: `Define the package manager to use for the current project`,
    details: `
      When run, this command will retrieve the latest release matching the
      provided descriptor, assign it to the project's package.json file, and
      automatically perform an install.
    `,
    examples: [[
      `Configure the project to use the latest Yarn release`,
      `corepack use 'yarn@*'`,
    ]],
  });

  pattern = Option.String();

  async execute() {
    const [descriptor] = await this.resolvePatternsToDescriptors({
      all: false,
      patterns: [this.pattern],
    });

    const resolved = await this.context.engine.resolveDescriptor(descriptor, {allowTags: true, useCache: false});
    if (resolved === null)
      throw new UsageError(`Failed to successfully resolve '${descriptor.range}' to a valid ${descriptor.name} release`);

    this.context.stdout.write(`Installing ${resolved.name}@${resolved.reference} in the project...\n`);

    const packageManagerInfo = await this.context.engine.ensurePackageManager(resolved);
    await this.setLocalPackageManager(packageManagerInfo);
  }
}
