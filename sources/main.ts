import {BaseContext, Builtins, Cli, Command, Option, UsageError} from 'clipanion';

import {Engine}                                                  from './Engine';
import {DisableCommand}                                          from './commands/Disable';
import {EnableCommand}                                           from './commands/Enable';
import {HydrateCommand}                                          from './commands/Hydrate';
import {PrepareCommand}                                          from './commands/Prepare';
import * as miscUtils                                            from './miscUtils';
import * as pmmUtils                                             from './pmmUtils';
import * as specUtils                                            from './specUtils';
import {Locator, isSupportedPackageManager}                      from './types';

export type CustomContext = {cwd: string, engine: Engine};
export type Context = BaseContext & CustomContext;

export async function main(argv: Array<string>, context: CustomContext & Partial<Context>) {
  const firstArg = argv[0];
  const [, candidatePackageManager, requestedVersion] = firstArg.match(/^([^@]*)(?:@(.*))?$/)!;

  if (isSupportedPackageManager(candidatePackageManager)) {
    const packageManager = candidatePackageManager;
    const binaryName = argv[1];

    // Note: we're playing a bit with Clipanion here, since instead of letting it
    // decide how to route the commands, we'll instead tweak the init settings
    // based on the arguments.
    const cli = new Cli<Context>({binaryName});
    const defaultVersion = await context.engine.getDefaultVersion(packageManager);

    class BinaryCommand extends Command<Context> {
      proxy = Option.Proxy();

      async execute() {
        const definition = context.engine.config.definitions[packageManager]!;

        // If all leading segments match one of the patterns defined in the `transparent`
        // key, we tolerate calling this binary even if the local project isn't explicitly
        // configured for it, and we use the special default version if requested.
        let isTransparentCommand = false;
        for (const transparentPath of definition.transparent.commands) {
          if (transparentPath[0] === binaryName && transparentPath.slice(1).every((segment, index) => segment === this.proxy[index])) {
            isTransparentCommand = true;
            break;
          }
        }

        const fallbackReference = isTransparentCommand
          ? definition.transparent.default ?? defaultVersion
          : defaultVersion;

        const fallbackLocator: Locator = {
          name: packageManager,
          reference: fallbackReference,
        };

        let descriptor;
        try {
          descriptor = await specUtils.findProjectSpec(this.context.cwd, fallbackLocator, {transparent: isTransparentCommand});
        } catch (err) {
          if (err instanceof miscUtils.Cancellation) {
            return 1;
          } else {
            throw err;
          }
        }

        if (requestedVersion)
          descriptor.range = requestedVersion;

        const resolved = await context.engine.resolveDescriptor(descriptor, {allowTags: true});
        if (resolved === null)
          throw new UsageError(`Failed to successfully resolve '${descriptor.range}' to a valid ${descriptor.name} release`);

        const installSpec = await context.engine.ensurePackageManager(resolved);
        const exitCode = await pmmUtils.runVersion(installSpec, resolved, binaryName, this.proxy, this.context);

        return exitCode;
      }
    }

    cli.register(BinaryCommand);

    return await cli.run(argv.slice(2), {
      ...Cli.defaultContext,
      ...context,
    });
  } else {
    const binaryVersion = eval(`require`)(`corepack/package.json`).version;
    const cli = new Cli<Context>({binaryName: `corepack`, binaryVersion});

    cli.register(Builtins.HelpCommand);
    cli.register(Builtins.VersionCommand);

    cli.register(EnableCommand);
    cli.register(DisableCommand);
    cli.register(HydrateCommand);
    cli.register(PrepareCommand);

    return await cli.run(argv, {
      ...Cli.defaultContext,
      ...context,
    });
  }
}

export function runMain(argv: Array<string>) {
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

// Using `eval` to be sure that Webpack doesn't transform it
if (process.mainModule === eval(`module`))
  runMain(process.argv.slice(2));
