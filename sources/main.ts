import {BaseContext, Builtins, Cli, Command, Option} from 'clipanion';

import {version as corepackVersion}                  from '../package.json';

import {Engine, PackageManagerRequest}               from './Engine';
import {CacheCommand}                                from './commands/Cache';
import {DisableCommand}                              from './commands/Disable';
import {EnableCommand}                               from './commands/Enable';
import {InstallGlobalCommand}                        from './commands/InstallGlobal';
import {InstallLocalCommand}                         from './commands/InstallLocal';
import {PackCommand}                                 from './commands/Pack';
import {UpCommand}                                   from './commands/Up';
import {UseCommand}                                  from './commands/Use';
import {HydrateCommand}                              from './commands/deprecated/Hydrate';
import {PrepareCommand}                              from './commands/deprecated/Prepare';

export type CustomContext = {cwd: string, engine: Engine};
export type Context = BaseContext & CustomContext;

function getPackageManagerRequestFromCli(parameter: string | undefined, context: CustomContext & Partial<Context>): PackageManagerRequest | null {
  if (!parameter)
    return null;

  const match = parameter.match(/^([^@]*)(?:@(.*))?$/);
  if (!match)
    return null;

  const [, binaryName, binaryVersion] = match;
  const packageManager = context.engine.getPackageManagerFor(binaryName)!;

  if (packageManager == null && binaryVersion == null) return null;

  return {
    packageManager,
    binaryName,
    binaryVersion: binaryVersion || null,
  };
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

    cli.register(CacheCommand);
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
        return this.context.engine.executePackageManagerRequest(request, {
          cwd: this.context.cwd,
          args: this.proxy,
        });
      }
    });

    code = await cli.run(restArgs, context);
  }

  if (code !== 0) {
    process.exitCode ??= code;
  }
}
