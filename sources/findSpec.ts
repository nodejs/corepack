import {UsageError}               from 'clipanion';
import {existsSync, readFileSync} from 'fs';
import {dirname, join, relative}  from 'path';
import semver                     from 'semver';

import {defaultVersions}          from './config';
import {initProjectAndEnableSpec} from './interactiveTools';

export async function findSpec(initialCwd: string, preferred: string): Promise<{name: string, range: string}> {
    while (true) {
        const result = loadSpec(initialCwd);

        switch (result.type) {
            case `NoProject`: {
                await initProjectAndEnableSpec(preferred, result.target);
            } break;

            case `NoSpec`: {
                return {name: preferred, range: defaultVersions.get(preferred)!};
            } break;

            case `Found`: {
                if (result.spec.name !== preferred) {
                    throw new UsageError(`This project is configured to use ${result.spec.name}`);
                } else {
                    return result.spec;
                }
            } break;
        }
    }
}

type LoadSpecResult =
    | {type: `NoProject`, target: string}
    | {type: `NoSpec`, target: string}
    | {type: `Found`, spec: {name: string, range: string}};

function loadSpec(initialCwd: string): LoadSpecResult {
    let nextCwd = initialCwd;
    let currCwd = ``;

    let selection: any = null;

    while (nextCwd !== currCwd && selection === null) {
        currCwd = nextCwd;
        nextCwd = dirname(currCwd);

        const manifestPath = join(currCwd, `package.json`);
        if (!existsSync(manifestPath))
            continue;

        const content = readFileSync(manifestPath, `utf8`);

        const data = cleanParseJSON(content);
        if (typeof data !== `object` || data === null)
            throw new UsageError(`Invalid package.json in ${relative(initialCwd, manifestPath)}`);

        selection = {data, manifestPath};
    }

    if (selection === null)
        return {type: `NoProject`, target: join(initialCwd, `package.json`)};

    const engines = selection.data.engines;
    if (typeof engines === `undefined`)
        return {type: `NoSpec`, target: selection.manifestPath};
    if (typeof engines !== `object` || engines === null)
        throw new UsageError(`Invalid engines field in ${relative(initialCwd, selection.manifestPath)}`);

    const pmSpec = engines.pm;
    if (typeof pmSpec === `undefined`)
        return {type: `NoSpec`, target: selection.manifestPath};
    if (typeof pmSpec !== `string`)
        throw new UsageError(`Invalid package manager specification in ${relative(initialCwd, selection.manifestPath)}`);

    const match = pmSpec.match(/^(?!_)(.+)@(.+)$/);
    if (match === null || !semver.validRange(match[2]))
        throw new UsageError(`Invalid package manager specification in ${relative(initialCwd, selection.manifestPath)}`);

    return {
        type: `Found`,
        spec: {
            name: match[1],
            range: match[2],
        },
    };
}

function cleanParseJSON(content: string) {
    // We ignore syntax errors because they'll be thrown later
    // once we detect the content of the file isn't an object
    try {
        return JSON.parse(content);
    } catch (error) {
        return null;
    }
}
