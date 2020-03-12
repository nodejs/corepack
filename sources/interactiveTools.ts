import {UsageError}                              from 'clipanion';
import {prompt}                                  from 'enquirer';
import {existsSync, readFileSync, writeFileSync} from 'fs';
import {join}                                    from 'path';

import * as semverUtils                          from './tools/semverUtils';

import {getAllVersions}                          from './registry';

export async function persistPmSpec(preferred: string, target: string, message: string) {
    const allVersions = await getAllVersions();
    if (typeof allVersions[preferred] === `undefined`)
        throw new Error(`Unknown package manager type ${preferred}`);

    const pmVersions = Object.keys(allVersions[preferred]);
    const version = semverUtils.maxVersion(pmVersions);
    const newSpec = `${preferred}@^${version}`;

    const res = await prompt([{
        type: `confirm`,
        name: `confirm`,
        message: message.replace(`{}`, newSpec),
    }]);

    if (!res)
        throw new UsageError(`Execution canceled`)

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
