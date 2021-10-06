import {BaseContext, Builtins, Cli, Command, Option, UsageError} from 'clipanion';

import {Engine}                                                  from './Engine';
import {DisableCommand}                                          from './commands/Disable';
import {EnableCommand}                                           from './commands/Enable';
import {HydrateCommand}                                          from './commands/Hydrate';
import {PrepareCommand}                                          from './commands/Prepare';
import * as miscUtils                                            from './miscUtils';
import * as corepackUtils                                        from './corepackUtils';
import * as specUtils                                            from './specUtils';
import {Locator, SupportedPackageManagers, Descriptor}           from './types';

export type CustomContext = {cwd: string, engine: Engine};
export type Context = BaseContext & CustomContext;

type PackageManagerRequest = {
  packageManager: SupportedPackageManagers;
  binaryName: string;
  binaryVersion: string | null;
};

function getPackageManagerRequestFromCli(parameter: string | undefined, context: CustomContext & Partial<Context>): PackageManagerRequest {
  if (!parameter)
    return null;

  const match = parameter.match(/^([^@]*)(?:@(.*))?$/);
  if (!match)
    return null;

  const [, binaryName, binaryVersion] = match;
  const packageManager = context.engine.getPackageManagerFor(binaryName);
  if (!packageManager)
    return null;

  return {
    packageManager,
    binaryName,
    binaryVersion: binaryVersion || null,
  };
}

async function executePackageManagerRequest({packageManager, binaryName, binaryVersion}: PackageManagerRequest, args: Array<string>, context: Context) {
  const defaultVersion = await context.engine.getDefaultVersion(packageManager);
  const definition = context.engine.config.definitions[packageManager]!;

  // If all leading segments match one of the patterns defined in the `transparent`
  // key, we tolerate calling this binary even if the local project isn't explicitly
  // configured for it, and we use the special default version if requested.
  let isTransparentCommand = false;
  for (const transparentPath of definition.transparent.commands) {
    if (transparentPath[0] === binaryName && transparentPath.slice(1).every((segment, index) => segment === args[index])) {
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

  let descriptor: Descriptor;
  try {
    descriptor = await specUtils.findProjectSpec(context.cwd, fallbackLocator, {transparent: isTransparentCommand});
  } catch (err) {
    if (err instanceof miscUtils.Cancellation) {
      return 1;
    } else {
      throw err;
    }
  }

  if (binaryVersion)
    descriptor.range = binaryVersion;

  const resolved = await context.engine.resolveDescriptor(descriptor, {allowTags: true});
  if (resolved === null)
    throw new UsageError(`Failed to successfully resolve '${descriptor.range}' to a valid ${descriptor.name} release`);

  const installSpec = await context.engine.ensurePackageManager(resolved);
  const exitCode = await corepackUtils.runVersion(installSpec, resolved, binaryName, args, context);

  return exitCode;
}

export async function main(argv: Array<string>, context: CustomContext & Partial<Context>) {
  const corepackVersion = require(`../package.json`).version;

  const [firstArg, ...restArgs] = argv;
  const request = getPackageManagerRequestFromCli(firstArg, context);

  let cli: Cli<Context>;
  if (!request) {
    // If the first argument doesn't match any supported package manager, we fallback to the standard Corepack CLI
    cli = new Cli({
      binaryLabel: `Corepack`,
      binaryName: `corepack`,
      binaryVersion: corepackVersion,
    });

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
  } else {
    // Otherwise, we create a single-command CLI to run the specified package manager (we still use Clipanion in order to pretty-print usage errors).
    const cli = new Cli({
      binaryLabel: `'${request.binaryName}', via Corepack`,
      binaryName: request.binaryName,
      binaryVersion: `corepack/${corepackVersion}`,
    });

    cli.register(class BinaryCommand extends Command<Context> {
      proxy = Option.Proxy();
      async execute() {
        return executePackageManagerRequest(request, this.proxy, this.context);
      }
    });

    return await cli.run(restArgs, {
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
