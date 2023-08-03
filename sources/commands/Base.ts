import {Command, UsageError}        from 'clipanion';
import fs                           from 'fs';

import {PreparedPackageManagerInfo} from '../Engine';
import * as corepackUtils           from '../corepackUtils';
import {Context}                    from '../main';
import * as nodeUtils               from '../nodeUtils';
import * as specUtils               from '../specUtils';

export abstract class BaseCommand extends Command<Context> {
  async resolvePatternsToDescriptors({all, patterns}: {all: boolean, patterns: Array<string>}) {
    if (all && patterns.length > 0)
      throw new UsageError(`The --all option cannot be used along with an explicit package manager specification`);

    const resolvedSpecs = all
      ? await this.context.engine.getDefaultDescriptors()
      : patterns.map(pattern => specUtils.parseSpec(pattern, `CLI arguments`, {enforceExactVersion: false}));

    if (resolvedSpecs.length === 0) {
      const lookup = await specUtils.loadSpec(this.context.cwd);
      switch (lookup.type) {
        case `NoProject`:
          throw new UsageError(`Couldn't find a project in the local directory - please explicit the package manager to pack, or run this command from a valid project`);

        case `NoSpec`:
          throw new UsageError(`The local project doesn't feature a 'packageManager' field - please explicit the package manager to pack, or update the manifest to reference it`);

        default: {
          return [lookup.spec];
        }
      }
    }

    return resolvedSpecs;
  }

  async setLocalPackageManager(info: PreparedPackageManagerInfo) {
    const lookup = await specUtils.loadSpec(this.context.cwd);

    const content = lookup.target !== `NoProject`
      ? await fs.promises.readFile(lookup.target, `utf8`)
      : ``;

    const {data, indent} = nodeUtils.readPackageJson(content);

    const previousPackageManager = data.packageManager ?? `unknown`;
    data.packageManager = `${info.locator.name}@${info.locator.reference}+${info.hash}`;

    const newContent = nodeUtils.normalizeLineEndings(content, `${JSON.stringify(data, null, indent)}\n`);
    await fs.promises.writeFile(lookup.target, newContent, `utf8`);

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
