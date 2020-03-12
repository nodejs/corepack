import {Cli, Command, UsageError} from 'clipanion';

import {findSpec}                 from './findSpec';
import {runSpec}                  from './runSpec';

const cli = new Cli({
    binaryName: `pmm`,
});

const entries = [
    [`npm`, `npm`],
    [`npx`, `npm`],
    [`pnpm`, `pnpm`],
    [`pnpx`, `pnpm`],
    [`yarn`, `yarn`],
];

for (const [binaryName, pmName] of entries) {
    class BinaryCommand extends Command {
        @Command.Proxy()
        public proxy: string[] = [];

        @Command.Path(binaryName)
        async execute() {
            const spec = await findSpec(pmName);
            return await runSpec(spec, binaryName, this.proxy);
        }
    }

    cli.register(BinaryCommand);
}

class ListingCommand extends Command {
    @Command.Path(`--list`)
    async execute() {
        for (const [entry] of entries) {
            console.log(entry);
        }
    }
}

cli.register(ListingCommand);

cli.runExit(process.argv.slice(2), {
    ...Cli.defaultContext,
});
