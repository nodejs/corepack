import {BaseContext, Cli, Command} from 'clipanion';

import {entries}                   from './config';
import {findSpec}                  from './findSpec';
import {runSpec}                   from './runSpec';

export type Context = BaseContext & {
    cwd: string,
};

export class Cancellation extends Error {
}

const cli = new Cli<Context>({
    binaryName: `pmm`,
});

for (const [binaryName, pmName] of entries) {
    class BinaryCommand extends Command<Context> {
        @Command.Proxy()
        public proxy: string[] = [];

        @Command.Path(binaryName)
        async execute() {
            try {
                const spec = await findSpec(this.context.cwd, pmName);
                return await runSpec(spec, binaryName, this.proxy, this.context);
            } catch (error) {
                if (error instanceof Cancellation) {
                    return 1;
                } else {
                    throw error;
                }
            }
        }
    }

    cli.register(BinaryCommand);
}

class ListingCommand extends Command<Context> {
    @Command.Path(`--list`)
    async execute() {
        for (const [entry] of entries) {
            console.log(entry);
        }
    }
}

cli.register(ListingCommand);

export {cli};

declare const __non_webpack_require__: any;

if (typeof __non_webpack_require__ !== `undefined` || process.mainModule === module) {
    cli.runExit(process.argv.slice(2), {
        ...Cli.defaultContext,
        cwd: process.cwd(),
    });
}
