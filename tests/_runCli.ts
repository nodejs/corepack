import {PortablePath, npath} from '@yarnpkg/fslib';
import {PassThrough}         from 'stream';

import {Engine}              from '../sources/Engine';
import {main}                from '../sources/main';

export async function runCli(cwd: PortablePath, argv: Array<string>) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();

  const out: Array<Buffer> = [];
  const err: Array<Buffer> = [];

  stdout.on(`data`, chunk => {
    out.push(chunk);
  });

  stderr.on(`data`, chunk => {
    err.push(chunk);
  });

  const exitCode = await main(argv, {
    cwd: npath.fromPortablePath(cwd),
    engine: new Engine(),
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
