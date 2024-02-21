import {Command, Option, UsageError} from 'clipanion';


import {fetchLatestStableVersion}    from '../corepackUtils';

import {BaseCommand}                 from './Base';


export class UseCommand extends BaseCommand {
  static paths = [
    [`use`],
  ];

  fromNpm = Option.Boolean(`--from-npm`, false, {
    description: `If true, the package manager will be installed from the npm registry`,
  });

  static usage = Command.Usage({
    description: `Define the package manager to use for the current project`,
    details: `
      When run, this command will retrieve the latest release matching the
      provided descriptor, assign it to the project's package.json file, and
      automatically perform an install.
    `,
    examples: [[
      `Configure the project to use the latest Yarn release`,
      `corepack use yarn`,
    ], [
      `Configure the project to use the latest Yarn release available from the "yarn" package on the npm registry`,
      `corepack use yarn --from-npm`,
    ]],
  });

  pattern = Option.String();

  async execute() {
    let packageManagerInfo: Parameters<typeof this.setLocalPackageManager>[0];
    if (this.fromNpm) {
      const registry = {
        type: `npm` as const,
        package: this.pattern,
      };
      const versionWithHash = await fetchLatestStableVersion(registry);
      const [version, hash] = versionWithHash.split(`+`);
      const location = `https://registry.npmjs.com/${this.pattern}/-/${this.pattern}-${version}.tgz`;
      packageManagerInfo = {
        locator: {
          name: this.pattern,
          reference: location,
        },
        spec: {
          bin: {},
          registry,
          url: location,
        },
        hash,
        location,
        bin: undefined,
      };
    } else {
      const [descriptor] = await this.resolvePatternsToDescriptors({
        patterns: [this.pattern],
      });

      const resolved = await this.context.engine.resolveDescriptor(descriptor, {allowTags: true, useCache: false});
      if (resolved === null)
        throw new UsageError(`Failed to successfully resolve '${descriptor.range}' to a valid ${descriptor.name} release`);

      this.context.stdout.write(`Installing ${resolved.name}@${resolved.reference} in the project...\n`);

      packageManagerInfo = await this.context.engine.ensurePackageManager(resolved);
    }
    await this.setLocalPackageManager(packageManagerInfo);
  }
}
