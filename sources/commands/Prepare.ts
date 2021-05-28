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
      This command generates an archive for the specified package manager, in a format suitable for later hydratation via the \`corepack hydrate\` command.

      If run without parameter, it'll extract the package manager spec from the active project. Otherwise an explicit spec string is required, that Corepack will resolve before installing and packing.
    `,
    examples: [[
      `Generate an archive from the active project`,
      `$0 prepare`,
    ], [
      `Generate an archive from a specific Yarn version`,
      `$0 prepare yarn@2.2.2`,
    ]],
  });


  cacheOnly = Option.Boolean(`--cache-only`, false, {
    description: `If true, cache the package manager without generating a tarball`,
  });

  activate = Option.Boolean(`--activate`, false, {
    description: `If true, this release will become the default one for this package manager`,
  });

  all = Option.Boolean(`--all`, false, {
    description: `If true, all available default package managers will be packed together`,
  });

  json = Option.Boolean(`--json`, false, {
    description: `If true, the output will be the path of the generated tarball`,
  });

  spec = Option.String({required: false})

  async execute() {
    if (this.all && typeof this.spec !== `undefined`)
      throw new UsageError(`The --all option cannot be used along with an explicit package manager specification`);

    const specs = this.all
      ? await this.context.engine.getDefaultDescriptors()
      : [this.spec];

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

      const baseInstallFolder = folderUtils.getInstallFolder();
      const installSpec = await this.context.engine.ensurePackageManager(resolved);

      if (this.activate)
        await this.context.engine.activatePackageManager(resolved);

      if (this.cacheOnly)
        continue;

      const fileName = typeof request !== `undefined`
        ? path.join(this.context.cwd, `corepack-${resolved.name}-${resolved.reference}.tgz`)
        : path.join(this.context.cwd, `corepack-${resolved.name}.tgz`);

      const {default: tar} = await import(`tar`);
      await tar.c({gzip: true, cwd: baseInstallFolder, file: fileName}, [path.relative(baseInstallFolder, installSpec.location)]);

      if (this.json) {
        this.context.stdout.write(`${JSON.stringify(fileName)}\n`);
      } else {
        this.context.stdout.write(`Packed ${fileName}\n`);
      }
    }
  }
}
