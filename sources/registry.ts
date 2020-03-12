import {readFileSync} from 'fs';
import {join}         from 'path';

import * as httpUtils from './tools/httpUtils';

const DEFAULT_SPEC_SOURCE = join(__dirname, `../versions.json`);

function getVersionFileFromFs(sourcePath: string) {
    const content = readFileSync(sourcePath, `utf8`);
    const data = JSON.parse(content);

    return data;
}

export async function getAllVersions() {
    const source = typeof process.env.NODE_PM_SPECS !== `undefined`
        ? process.env.NODE_PM_SPECS
        : DEFAULT_SPEC_SOURCE;

    if (source.match(/^https?:/)) {
        return await httpUtils.fetchUrlJson(source);
    } else {
        return await getVersionFileFromFs(source);
    }
}
