import {Command, UsageError} from 'clipanion';
import path from 'path';
import tar from 'tar';

import {Context} from '../main'
import * as folderUtils from '../folderUtils';
import * as specUtils from '../specUtils';

export class PackCommand extends Command<Context> {
    static usage = Command.Usage({
        description: `Generate a package manager archive`,
        details: `
            This command generates an archive for the specified package manager, in a format suitable for later hydratation via the \`pmm hydrate\` command.

            If run without parameter, it'll extract the package manager spec from the active project. Otherwise, an explicit spec string is required, that pmm will resolve before installing and packing.
        `,
        examples: [[
            `Generate an archive from the active project`,
            `$0 pack`,
        ], [
            `Generate an archive from a specific Yarn version`,
            `$0 pack yarn@2.2.2`,
        ]],
    });

    @Command.String({required: false})
    spec?: string;

    @Command.Boolean(`--json`)
    json: boolean = false;

    @Command.Path(`pack`)
    async execute() {
        let spec;

        if (typeof this.spec === `undefined`) {
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
            spec = specUtils.parseSpec(this.spec);
        }

        const resolved = await this.context.engine.resolveDescriptor(spec);
        if (resolved === null)
            throw new UsageError(`Failed to successfully resolve '${spec.range}' to a valid ${spec.name} release`);

        const baseInstallFolder = folderUtils.getInstallFolder();
        const installFolder = await this.context.engine.ensurePackageManager(resolved);

        const fileName = typeof this.spec !== `undefined`
            ? path.join(this.context.cwd, `pmm-${resolved.name}-${resolved.reference}.tgz`)
            : path.join(this.context.cwd, `pmm-${resolved.name}.tgz`);

        await tar.c({gzip: true, cwd: baseInstallFolder, file: fileName}, [path.relative(baseInstallFolder, installFolder)]);

        if (this.json) {
            this.context.stdout.write(`${JSON.stringify(fileName)}\n`);
        } else {
            this.context.stdout.write(`Packed ${fileName}\n`);
        }
    }
}
