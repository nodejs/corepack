import {BaseContext, Cli, Command} from 'clipanion';

import {entries}                   from './entries';
import {findSpec}                  from './findSpec';
import {runSpec}                   from './runSpec';

export type Context = BaseContext & {
    cwd: string,
};

const cli = new Cli<Context>({
    binaryName: `pmm`,
});

for (const [binaryName, pmName] of entries) {
    class BinaryCommand extends Command<Context> {
        @Command.Proxy()
        public proxy: string[] = [];

        @Command.Path(binaryName)
        async execute() {
            const spec = await findSpec(this.context.cwd, pmName);
            return await runSpec(spec, binaryName, this.proxy, this.context);
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

if (require.main === module) {
    cli.runExit(process.argv.slice(2), {
        ...Cli.defaultContext,
        cwd: process.cwd(),
    });
}
