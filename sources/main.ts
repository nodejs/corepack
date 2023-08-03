import {BaseContext, Builtins, Cli, Command, Option, UsageError} from 'clipanion';

import {version as corepackVersion}                              from '../package.json';

import {Engine}                                                  from './Engine';
import {DisableCommand}                                          from './commands/Disable';
import {EnableCommand}                                           from './commands/Enable';
import {InstallGlobalCommand}                                    from './commands/InstallGlobal';
import {InstallLocalCommand}                                     from './commands/InstallLocal';
import {PackCommand}                                             from './commands/Pack';
import {UpCommand}                                               from './commands/Up';
import {UseCommand}                                              from './commands/Use';
import {HydrateCommand}                                          from './commands/deprecated/Hydrate';
import {PrepareCommand}                                          from './commands/deprecated/Prepare';
import * as corepackUtils                                        from './corepackUtils';
import * as miscUtils                                            from './miscUtils';
import * as specUtils                                            from './specUtils';
import {Locator, SupportedPackageManagers, Descriptor}           from './types';

export type CustomContext = {cwd: string, engine: Engine};
export type Context = BaseContext & CustomContext;

type PackageManagerRequest = {
  packageManager: SupportedPackageManagers;
  binaryName: string;
  binaryVersion: string | null;
};

function getPackageManagerRequestFromCli(parameter: string | undefined, context: CustomContext & Partial<Context>): PackageManagerRequest | null {
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

  return await corepackUtils.runVersion(resolved, installSpec, binaryName, args);
}

export async function runMain(argv: Array<string>) {
  // Because we load the binaries in the same process, we don't support custom contexts.
  const context = {
    ...Cli.defaultContext,
    cwd: process.cwd(),
    engine: new Engine(),
  };

  const [firstArg, ...restArgs] = argv;
  const request = getPackageManagerRequestFromCli(firstArg, context);

  let code: number;

  if (!request) {
    // If the first argument doesn't match any supported package manager, we fallback to the standard Corepack CLI
    const cli = new Cli({
      binaryLabel: `Corepack`,
      binaryName: `corepack`,
      binaryVersion: corepackVersion,
    });

    cli.register(Builtins.HelpCommand);
    cli.register(Builtins.VersionCommand);

    cli.register(DisableCommand);
    cli.register(EnableCommand);
    cli.register(InstallGlobalCommand);
    cli.register(InstallLocalCommand);
    cli.register(PackCommand);
    cli.register(UpCommand);
    cli.register(UseCommand);

    // Deprecated commands
    cli.register(HydrateCommand);
    cli.register(PrepareCommand);

    code = await cli.run(argv, context);
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

    code = await cli.run(restArgs, context);
  }

  if (code !== 0) {
    process.exitCode ??= code;
  }
}
