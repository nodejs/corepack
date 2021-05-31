import {Command, Option, UsageError} from 'clipanion';
import path                          from 'path';

import * as folderUtils              from '../folderUtils';
import {Context}                     from '../main';
import * as specUtils                from '../specUtils';
import {Descriptor}                  from '../types';

export class PrepareCommand extends Command<Context> {
  static paths = [
    [`prepare`],
  ];

  static usage = Command.Usage({
    description: `Generate a package manager archive`,
    details: `
      This command makes sure that the specified package managers are installed in the local cache. Calling this command explicitly unless you operate in an environment without network access (in which case you'd have to call \`prepare\` while building your image, to make sure all tools are available for later use).

      When the \`-o,--output\` flag is set, Corepack will also compress the resulting package manager into a format suitable for \`corepack hydrate\`, and will store it at the specified location on the disk.
    `,
    examples: [[
      `Prepare the package manager from the active project`,
      `$0 prepare`,
    ], [
      `Prepare a specific Yarn version`,
      `$0 prepare yarn@2.2.2`,
    ], [
      `Generate an archive for a specific Yarn version`,
      `$0 prepare yarn@2.2.2 -o`,
    ], [
      `Generate a named archive`,
      `$0 prepare yarn@2.2.2 --output=yarn.tgz`,
    ]],
  });

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

  specs = Option.Rest()

  async execute() {
    if (this.all && this.specs.length > 0)
      throw new UsageError(`The --all option cannot be used along with an explicit package manager specification`);

    const specs = this.all
      ? await this.context.engine.getDefaultDescriptors()
      : this.specs;

    const installLocations: Array<string> = [];

    for (const request of specs) {
      let spec: Descriptor;

      if (typeof request === `undefined`) {
        const lookup = await specUtils.loadSpec(this.context.cwd);
        switch (lookup.type) {
          case `NoProject`:
            throw new UsageError(`Couldn't find a project in the local directory - please explicit the package manager to pack, or run this command from a valid project`);

          case `NoSpec`:
            throw new UsageError(`The local project doesn't feature a 'packageManager' field - please explicit the package manager to pack, or update the manifest to reference it`);

          default: {
            spec = lookup.spec;
          }
        }
      } else {
        spec = typeof request === `string`
          ? specUtils.parseSpec(request, `CLI arguments`)
          : request;
      }

      const resolved = await this.context.engine.resolveDescriptor(spec);
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
