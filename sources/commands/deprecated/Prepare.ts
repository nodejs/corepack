import {Command, Option, UsageError} from 'clipanion';
import {mkdir}                       from 'fs/promises';
import path                          from 'path';

import * as folderUtils              from '../../folderUtils';
import {Context}                     from '../../main';
import * as specUtils                from '../../specUtils';
import {Descriptor}                  from '../../types';

export class PrepareCommand extends Command<Context> {
  static paths = [
    [`prepare`],
  ];

  activate = Option.Boolean(`--activate`, false, {
    description: `If true, this release will become the default one for this package manager`,
  });

  all = Option.Boolean(`--all`, false, {
    description: `If true, all available default package managers will be installed`,
  });

  json = Option.Boolean(`--json`, false, {
    description: `If true, the output will be the path of the generated tarball`,
  });

  output = Option.String(`-o,--output`, {
    description: `If true, the installed package managers will also be stored in a tarball`,
    tolerateBoolean: true,
  });

  specs = Option.Rest();

  async execute() {
    if (this.all && this.specs.length > 0)
      throw new UsageError(`The --all option cannot be used along with an explicit package manager specification`);

    const specs: Array<string | Descriptor> = this.all
      ? await this.context.engine.getDefaultDescriptors()
      : this.specs;

    const installLocations: Array<string> = [];

    if (specs.length === 0) {
      const lookup = await specUtils.loadSpec(this.context.cwd);
      switch (lookup.type) {
        case `NoProject`:
          throw new UsageError(`Couldn't find a project in the local directory - please explicit the package manager to pack, or run this command from a valid project`);

        case `NoSpec`:
          throw new UsageError(`The local project doesn't feature a 'packageManager' field - please explicit the package manager to pack, or update the manifest to reference it`);

        default: {
          specs.push(lookup.spec);
        }
      }
    }

    for (const request of specs) {
      const spec = typeof request === `string`
        ? specUtils.parseSpec(request, `CLI arguments`, {enforceExactVersion: false})
        : request;

      const resolved = await this.context.engine.resolveDescriptor(spec, {allowTags: true});
      if (resolved === null)
        throw new UsageError(`Failed to successfully resolve '${spec.range}' to a valid ${spec.name} release`);

      if (!this.json) {
        if (this.activate) {
          this.context.stdout.write(`Preparing ${spec.name}@${spec.range} for immediate activation...\n`);
        } else {
          this.context.stdout.write(`Preparing ${spec.name}@${spec.range}...\n`);
        }
      }

      const installSpec = await this.context.engine.ensurePackageManager(resolved);
      installLocations.push(installSpec.location);

      if (this.activate) {
        await this.context.engine.activatePackageManager(resolved);
      }
    }

    if (this.output) {
      const outputName = typeof this.output === `string`
        ? this.output
        : `corepack.tgz`;

      const baseInstallFolder = folderUtils.getInstallFolder();
      const outputPath = path.resolve(this.context.cwd, outputName);

      if (!this.json)
        this.context.stdout.write(`Packing the selected tools in ${path.basename(outputPath)}...\n`);

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
}
