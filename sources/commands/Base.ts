import {Command, Option, UsageError}     from 'clipanion';

import type {PreparedPackageManagerInfo} from '../Engine.ts';
import * as corepackUtils                from '../corepackUtils.ts';
import * as debugUtils                   from '../debugUtils.ts';
import type {Context}                    from '../main.ts';
import * as specUtils                    from '../specUtils.ts';

export abstract class BaseCommand extends Command<Context> {
  verbose = Option.Boolean(`--verbose`, false, {
    description: `Print Corepack diagnostic information on stderr`,
  });

  async validateAndExecute() {
    const wasEnabled = debugUtils.log.enabled;
    if (this.verbose)
      debugUtils.log.enabled = true;

    try {
      if (this.path.length > 0)
        debugUtils.log(`Running ${this.path.join(` `)}`);

      return await super.validateAndExecute();
    } finally {
      if (this.verbose) {
        debugUtils.log.enabled = wasEnabled;
      }
    }
  }

  async resolvePatternsToDescriptors({patterns}: {patterns: Array<string>}) {
    const resolvedSpecs = patterns.map(pattern => specUtils.parseSpec(pattern, `CLI arguments`, {enforceExactVersion: false}));

    if (resolvedSpecs.length === 0) {
      const lookup = await specUtils.loadSpecAndEnv(this.context.cwd);
      switch (lookup.type) {
        case `NoProject`:
          throw new UsageError(`Couldn't find a project in the local directory - please specify the package manager to pack, or run this command from a valid project`);

        case `NoSpec`: {
          const {devEnginesValue} = lookup;
          if (devEnginesValue?.version)
            return [specUtils.devEnginesToDescriptor(devEnginesValue)];

          throw new UsageError(`The local project doesn't feature a 'packageManager' field ${devEnginesValue ? `` : `nor a 'devEngines.packageManager' field `}- please specify the package manager to pack, or update the manifest to reference it`);
        }

        default: {
          const {devEnginesValue} = lookup;
          return [devEnginesValue?.version ? specUtils.devEnginesToDescriptor(devEnginesValue) : lookup.getSpec()];
        }
      }
    } else {
      await specUtils.loadSpecAndEnv(this.context.cwd, {envOnly: true});
    }

    return resolvedSpecs;
  }

  async setAndInstallLocalPackageManager(info: PreparedPackageManagerInfo) {
    const {
      previousPackageManager,
    } = await specUtils.setLocalPackageManager(this.context.cwd, info);

    const command = this.context.engine.getPackageManagerSpecFor(info.locator).commands?.use ?? null;
    if (command === null)
      return 0;

    // Adding it into the environment avoids breaking package managers that
    // don't expect those options.
    process.env.COREPACK_MIGRATE_FROM = previousPackageManager;
    this.context.stdout.write(`\n`);

    const [binaryName, ...args] = command;
    return await corepackUtils.runVersion(info.locator, info, binaryName, args);
  }
}
