import {Command, UsageError}             from 'clipanion';

import type {PreparedPackageManagerInfo} from '../Engine.ts';
import * as corepackUtils                from '../corepackUtils.ts';
import type {Context}                    from '../main.ts';
import * as specUtils                    from '../specUtils.ts';

export abstract class BaseCommand extends Command<Context> {
  async resolvePatternsToDescriptors({patterns}: {patterns: Array<string>}) {
    const resolvedSpecs = patterns.map(pattern => specUtils.parseSpec(pattern, `CLI arguments`, {enforceExactVersion: false}));

    if (resolvedSpecs.length === 0) {
      const lookup = await specUtils.loadSpecAndEnv(this.context.cwd);
      switch (lookup.type) {
        case `NoProject`:
          throw new UsageError(`Couldn't find a project in the local directory - please specify the package manager to pack, or run this command from a valid project`);

        case `NoSpec`:
          if (lookup.devEnginesValue?.range) return [lookup.devEnginesValue];
          throw new UsageError(`The local project doesn't feature a 'packageManager' field ${lookup.devEnginesValue ? `` : `nor a 'devEngines.packageManager' field `}- please specify the package manager to pack, or update the manifest to reference it`);

        default: {
          return [lookup.devEnginesValue ?? lookup.getSpec()];
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
