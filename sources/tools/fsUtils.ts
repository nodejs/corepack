import {symlinkSync}       from 'fs';
import {dirname, relative} from 'path';

export async function mutex(p: string, cb: () => Promise<void>) {
    return await cb();
}

export function makeShim(target: string, path: string) {
    symlinkSync(relative(dirname(target), path), target, `file`);
}
