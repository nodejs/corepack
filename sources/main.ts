import {BaseContext, Cli, Command, UsageError} from 'clipanion';

import {HydrateCommand} from './commands/Hydrate';
import {PackCommand} from './commands/Pack';
import {Engine} from './Engine';
import * as miscUtils from './miscUtils';
import * as pmmUtils from './pmmUtils';
import * as specUtils from './specUtils';
import {Locator, isSupportedPackageManager} from './types';

export type CustomContext = {cwd: string, engine: Engine};
export type Context = BaseContext & CustomContext;

export async function main(argv: string[], context: CustomContext & Partial<Context>) {
    const firstArg = argv[0];

    if (isSupportedPackageManager(firstArg)) {
        const packageManager = firstArg;
        const binaryName = argv[1];

        // Note: we're playing a bit with Clipanion here, since instead of letting it
        // decide how to route the commands, we'll instead tweak the init settings
        // based on the arguments.
        const cli = new Cli<Context>({binaryName});
        const defaultVersion = context.engine.getDefaultVersion(firstArg);

        const potentialLocator: Locator = {
            name: packageManager,
            reference: defaultVersion,
        };

        class BinaryCommand extends Command<Context> {
            public proxy: string[] = [];

            async execute() {
                let descriptor;
                try {
                    descriptor = await specUtils.findProjectSpec(this.context.cwd, potentialLocator);
                } catch (err) {
                    if (err instanceof miscUtils.Cancellation) {
                        return 1;
                    } else {
                        throw err;
                    }
                }

                const resolved = await context.engine.resolveDescriptor(descriptor);
                if (resolved === null)
                    throw new UsageError(`Failed to successfully resolve '${descriptor.range}' to a valid ${descriptor.name} release`);

                const installTarget = await context.engine.ensurePackageManager(resolved);
                const exitCode = await pmmUtils.runVersion(installTarget, resolved, binaryName, this.proxy, this.context);

                return exitCode;
            }
        }

        BinaryCommand.addPath();
        BinaryCommand.addOption(`proxy`, Command.Proxy());

        cli.register(BinaryCommand);

        return await cli.run(argv.slice(2), {
            ...Cli.defaultContext,
            ...context,
        });
    } else {
        const cli = new Cli<Context>({binaryName: `pmm`});

        cli.register(Command.Entries.Help as any);

        cli.register(HydrateCommand);
        cli.register(PackCommand);

        return await cli.run(argv, {
            ...Cli.defaultContext,
            ...context,
        });
    }
}

export function runMain(argv: string[]) {
    main(argv, {
        cwd: process.cwd(),
        engine: new Engine(),
    }).then(exitCode => {
        process.exitCode = exitCode;
    }, err => {
        console.error(err.stack);
        process.exitCode = 1;
    });
}

declare const __non_webpack_require__: any;

if (typeof __non_webpack_require__ === `undefined` && process.mainModule === module) {
    runMain(process.argv.slice(2));
}
