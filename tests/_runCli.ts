import {PortablePath, npath} from '@yarnpkg/fslib';
import {PassThrough}         from 'stream';

import {main} from '../sources/main';

export async function runCli(cwd: PortablePath, argv: string[]) {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();

    const out: Buffer[] = [];
    const err: Buffer[] = [];

    stdout.on(`data`, chunk => {
        out.push(chunk);
    });

    stderr.on(`data`, chunk => {
        err.push(chunk);
    });

    const exitCode = await main(argv, {
        cwd: npath.fromPortablePath(cwd),
        stdin,
        stdout,
        stderr,
    });

    return {
        exitCode,
        stdout: Buffer.concat(out).toString(),
        stderr: Buffer.concat(err).toString(),
    };
}
