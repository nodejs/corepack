import {Command, Option}            from 'clipanion';
import fs                           from 'fs';
import path                         from 'path';
import semverParse                  from 'semver/functions/parse.js';
import semverRcompare               from 'semver/functions/rcompare.js';

import {getLastKnownGood}           from '../Engine.ts';
import {getInstallFolder}           from '../folderUtils.ts';
import type {Context}               from '../main.ts';
import {isNodeError}                from '../nodeUtils.ts';
import {loadSpecAndEnv}             from '../specUtils.ts';
import {SupportedPackageManagerSet} from '../types.ts';

export class ListCommand extends Command<Context> {
  static paths = [
    [`list`],
    [`ls`],
  ];

  static usage = Command.Usage({
    description: `List installed package managers`,
    details: `
      List locally cached versions of the supported package managers, marking
      each recorded global default with \`(default)\`. This command does not
      access the network or change the cache.
    `,
    examples: [[
      `List installed package managers and their recorded defaults`,
      `corepack list -g`,
    ]],
  });

  global = Option.Boolean(`-g,--global`, {required: true});

  json = Option.Boolean(`--json`, false, {
    description: `Print the installed versions as a JSON array`,
  });

  async execute() {
    await loadSpecAndEnv(this.context.cwd, {envOnly: true});
    const lastKnownGood = await getLastKnownGood();
    const installed: Array<{name: string, version: string, isDefault: boolean}> = [];

    for (const name of SupportedPackageManagerSet) {
      const folder = path.join(getInstallFolder(), name);
      let entries;
      try {
        entries = await fs.promises.readdir(folder, {withFileTypes: true});
      } catch (error) {
        if (isNodeError(error) && error.code === `ENOENT`)
          continue;
        throw error;
      }

      const defaultVersion = semverParse(lastKnownGood[name])?.version;
      for (const entry of entries) {
        if (!entry.isDirectory() || !semverParse(entry.name))
          continue;

        // The metadata file is written only after a successful download.
        let metadata;
        try {
          metadata = JSON.parse(await fs.promises.readFile(path.join(folder, entry.name, `.corepack`), `utf8`));
        } catch (error) {
          if (error instanceof SyntaxError || (isNodeError(error) && error.code === `ENOENT`))
            continue;
          throw error;
        }

        const version = semverParse(metadata?.locator?.reference)?.version;
        if (metadata?.locator?.name !== name || version !== entry.name)
          continue;

        installed.push({name, version, isDefault: version === defaultVersion});
      }
    }

    installed.sort((a, b) => a.name.localeCompare(b.name) || semverRcompare(a.version, b.version));

    if (this.json) {
      this.context.stdout.write(`${JSON.stringify(installed)}\n`);
    } else if (installed.length === 0) {
      this.context.stdout.write(`No package managers are installed in the Corepack cache.\n`);
    } else {
      for (const {name, version, isDefault} of installed) {
        this.context.stdout.write(`${name}@${version}${isDefault ? ` (default)` : ``}\n`);
      }
    }
  }
}
