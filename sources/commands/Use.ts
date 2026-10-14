import {Command, Option, UsageError} from 'clipanion';

import {isSupportedPackageManager}   from '../types.ts';

import {BaseCommand}                 from './Base.ts';

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

      When network access is disabled, omitting the version selects the default
      release, which must already be cached.
    `,
    examples: [[
      `Configure the project to use the latest Yarn release`,
      `corepack use yarn`,
    ]],
  });

  pattern = Option.String();

  async execute() {
    const [descriptor] = await this.resolvePatternsToDescriptors({
      patterns: [this.pattern],
    });

    const versionIsOmitted = this.pattern === descriptor.name || this.pattern === `${descriptor.name}@`;
    if (versionIsOmitted && process.env.COREPACK_ENABLE_NETWORK === `0` && isSupportedPackageManager(descriptor.name))
      descriptor.range = await this.context.engine.getDefaultVersion(descriptor.name);

    const resolved = await this.context.engine.resolveDescriptor(descriptor, {allowTags: true, useCache: false});
    if (resolved === null)
      throw new UsageError(`Failed to successfully resolve '${descriptor.range}' to a valid ${descriptor.name} release`);

    this.context.stdout.write(`Installing ${resolved.name}@${resolved.reference} in the project...\n`);

    const packageManagerInfo = await this.context.engine.ensurePackageManager(resolved);
    await this.setAndInstallLocalPackageManager(packageManagerInfo);
  }
}
