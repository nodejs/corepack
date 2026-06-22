import {Command, UsageError} from 'clipanion';
import semverValid           from 'semver/functions/valid';
import semverValidRange      from 'semver/ranges/valid';

import {BaseCommand}         from './Base';

// modified from ./Enable.ts
// https://github.com/nodejs/corepack/issues/505
export class ProjectInstallCommand extends BaseCommand {
  static paths = [
    [`project`, `install`],
  ];

  static usage = Command.Usage({
    description: `Add the Corepack shims to the install directories, and run the install command of the specified package manager`,
    details: `
      When run, this command will check whether the shims for the specified package managers can be found with the correct values inside the install directory. If not, or if they don't exist, they will be created.

      Then, it will run the install command of the specified package manager. If no package manager is specified, it will default to npm.

      It will locate the install directory by running the equivalent of \`which corepack\`.
    `,
    examples: [[
      `Enable all shims and install, putting shims next to the \`corepack\` binary`,
      `$0 project install`,
    ]],
  });

  async execute() {
    const [descriptor] = await this.resolvePatternsToDescriptors({
      patterns: [],
    });

    if (!semverValid(descriptor.range) && !semverValidRange(descriptor.range))
      throw new UsageError(`The 'corepack project install' command can only be used when your project's packageManager field is set to a semver version or semver range`);

    const resolved = await this.context.engine.resolveDescriptor(descriptor);
    if (!resolved)
      throw new UsageError(`Failed to successfully resolve '${descriptor.range}' to a valid ${descriptor.name} release`);

    this.context.stdout.write(`Installing ${resolved.name}@${resolved.reference} in the project...\n`);

    const packageManagerInfo = await this.context.engine.ensurePackageManager(resolved);
    await this.installLocalPackageManager(packageManagerInfo);
  }
}
