import {Command, Option, UsageError} from 'clipanion';
import {mkdir}                       from 'fs/promises';
import path                          from 'path';

import * as folderUtils              from '../folderUtils';

import {BaseCommand}                 from './Base';

export class PackCommand extends BaseCommand {
  static paths = [
    [`pack`],
  ];

  static usage = Command.Usage({
    description: `Store package managers in a tarball`,
    details: `
      Download the selected package managers and store them inside a tarball suitable for use with \`corepack install -g\`.
    `,
    examples: [[
      `Pack the package manager defined in the package.json file`,
      `corepack pack`,
    ], [
      `Pack the latest version of Yarn 1.x inside a file named corepack.tgz`,
      `corepack pack yarn@^1`,
    ], [
      `Pack the latest versions of all supported package managers inside a file named everything.tgz`,
      `corepack pack --all -o everything.tgz`,
    ]],
  });

  all = Option.Boolean(`--all`, false, {
    description: `If true, all available default package managers will be installed`,
  });

  json = Option.Boolean(`--json`, false, {
    description: `If true, the path to the generated tarball will be printed on stdout`,
  });

  output = Option.String(`-o,--output`, {
    description: `Where the tarball should be generated; by default "corepack.tgz"`,
  });

  patterns = Option.Rest();

  async execute() {
    const descriptors = await this.resolvePatternsToDescriptors({
      all: this.all,
      patterns: this.patterns,
    });

    const installLocations: Array<string> = [];

    for (const descriptor of descriptors) {
      const resolved = await this.context.engine.resolveDescriptor(descriptor, {allowTags: true, useCache: false});
      if (resolved === null)
        throw new UsageError(`Failed to successfully resolve '${descriptor.range}' to a valid ${descriptor.name} release`);

      this.context.stdout.write(`Adding ${resolved.name}@${resolved.reference} to the cache...\n`);
      const packageManagerInfo = await this.context.engine.ensurePackageManager(resolved);

      await this.context.engine.activatePackageManager(packageManagerInfo.locator);
      installLocations.push(packageManagerInfo.location);
    }

    const baseInstallFolder = folderUtils.getInstallFolder();
    const outputPath = path.resolve(this.context.cwd, this.output ?? `corepack.tgz`);

    if (!this.json) {
      this.context.stdout.write(`\n`);
      this.context.stdout.write(`Packing the selected tools in ${path.basename(outputPath)}...\n`);
    }

    const {default: tar} = await import(`tar`);

    // Recreate the folder in case it was deleted somewhere else:
    await mkdir(baseInstallFolder, {recursive: true});
    await tar.c({gzip: true, cwd: baseInstallFolder, file: path.resolve(outputPath)}, installLocations.map(location => {
      return path.relative(baseInstallFolder, location);
    }));

    if (this.json) {
      this.context.stdout.write(`${JSON.stringify(outputPath)}\n`);
    } else {
      this.context.stdout.write(`All done!\n`);
    }
  }
}
