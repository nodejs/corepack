import Enquirer                                  from 'enquirer';
import {existsSync, readFileSync, writeFileSync} from 'fs';

import {defaultVersions}                         from './config';
import {Cancellation}                            from './main';

export async function persistPmSpec(preferred: string, target: string, message: string) {
    const version = defaultVersions.get(preferred)!;
    const newSpec = `${preferred}@^${version}`;

    let res: boolean;
    try {
        res = await Enquirer.prompt([{
            type: `confirm`,
            name: `confirm`,
            message: message.replace(`{}`, newSpec),
        }]);
    } catch (err) {
        if (err === ``) {
            res = false;
        } else {
            throw err;
        }
    }

    if (!res)
        throw new Cancellation();

    const content = existsSync(target) ? readFileSync(target, `utf8`) : `{}`;
    const data = JSON.parse(content);

    data.engines = data.engines || {};
    data.engines.pm = newSpec;

    const serialized = JSON.stringify(data, null, 2);
    writeFileSync(target, `${serialized}\n`);
}

export async function initProjectAndEnableSpec(preferred: string, target: string) {
    return await persistPmSpec(preferred, target, `No configured project yet; set it to {}?`);
}

export async function enableSpec(preferred: string, target: string) {
    return await persistPmSpec(preferred, target, `No configured local package manager yet; set it to {}?`);
}
