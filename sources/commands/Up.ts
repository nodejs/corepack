import {Command, UsageError}           from 'clipanion';
import semverMajor                     from 'semver/functions/major';
import semverValid                     from 'semver/functions/valid';
import semverValidRange                from 'semver/ranges/valid';

import type {SupportedPackageManagers} from '../types';

import {BaseCommand}                   from './Base';

export class UpCommand extends BaseCommand {
  static paths = [
    [`up`],
  ];

  static usage = Command.Usage({
    description: `Update the package manager used in the current project`,
    details: `
      Retrieve the latest available version for the current major release line
      of the package manager used in the local project, and update the project
      to use it.

      Unlike \`corepack use\` this command doesn't take a package manager name
      nor a version range, as it will always select the latest available
      version from the same major line. Should you need to upgrade to a new
      major, use an explicit \`corepack use '{name}@*'\` call.
    `,
    examples: [[
      `Configure the project to use the latest Yarn release`,
      `corepack up`,
    ]],
  });

  async execute() {
    const [descriptor] = await this.resolvePatternsToDescriptors({
      patterns: [],
    });

    if (!semverValid(descriptor.range) && !semverValidRange(descriptor.range))
      throw new UsageError(`The 'corepack up' command can only be used when your project's packageManager field is set to a semver version or semver range`);

    const resolved = await this.context.engine.resolveDescriptor(descriptor, {useCache: false});
    if (!resolved)
      throw new UsageError(`Failed to successfully resolve '${descriptor.range}' to a valid ${descriptor.name} release`);

    const majorVersion = semverMajor(resolved.reference);
    const majorDescriptor = {name: descriptor.name as SupportedPackageManagers, range: `^${majorVersion}.0.0`};

    const highestVersion = await this.context.engine.resolveDescriptor(majorDescriptor, {useCache: false});
    if (!highestVersion)
      throw new UsageError(`Failed to find the highest release for ${descriptor.name} ${majorVersion}.x`);

    this.context.stdout.write(`Installing ${highestVersion.name}@${highestVersion.reference} in the project...\n`);

    const packageManagerInfo = await this.context.engine.ensurePackageManager(highestVersion);
    await this.setAndInstallLocalPackageManager(packageManagerInfo);
  }
}
