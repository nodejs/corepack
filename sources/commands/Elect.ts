import {Command, UsageError}                                 from 'clipanion';
import prompts, {Choice}                                     from 'prompts';

import {Context}                                             from '../main';
import * as miscUtils                                        from '../miscUtils';
import {SupportedPackageManagers, isSupportedPackageManager} from '../types';

export class ElectCommand extends Command<Context> {
  @Command.Array(`--exclude`)
  excluded: Array<string> = [];

  @Command.Boolean(`--query`)
  query: boolean = false;

  @Command.Path(`elect`)
  async execute() {
    let electedPackageManager = await this.context.engine.getElectedPackageManager();

    const excluded = new Set(this.excluded);
    const preferredIsExcluded = electedPackageManager !== null && excluded.has(electedPackageManager);

    if (!this.query || electedPackageManager === null || preferredIsExcluded) {
      const choices: Array<Choice> = [];

      for (const [title, value] of Object.entries(SupportedPackageManagers)) {
        const disabled = excluded.has(value);
        choices.push({title, description: this.context.engine.getDefinitionFor(value).homepage, value, disabled});
      }

      // Everyone loves fairness
      miscUtils.shuffleArray(choices);

      const enabledChoices = choices.filter(({disabled}) => {
        return !disabled;
      });

      if (enabledChoices.length === 0)
        throw new UsageError(`None of the available package managers match the requirements (excluded: ${[...excluded].join(`, `)})`);

      if (enabledChoices.length === 1) {
        electedPackageManager = [...enabledChoices][0].value as SupportedPackageManagers;
      } else {
        const {selected} = await prompts({
          type: `select`,
          name: `selected`,
          message: `Which package manager do you wish to use for newly created Node.js projects?`,
          choices,
          warn: `The tool you're using doesn't support this package manager`,
          stdin: this.context.stdin,
          stdout: this.context.stderr,
        });

        if (typeof selected === `undefined`)
          return 1;

        if (!isSupportedPackageManager(selected))
          throw new Error(`Assertion failed: Invalid package manager (${selected})`);

        electedPackageManager = selected;

        if (!this.query || electedPackageManager === null) {
          this.context.engine.electPackageManager(electedPackageManager);
        }
      }
    }

    if (this.query)
      this.context.stdout.write(`${electedPackageManager}`);

    return 0;
  }
}
