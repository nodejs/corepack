import {PortablePath, npath} from '@yarnpkg/fslib';
import {spawn}               from 'child_process';

export async function runCli(cwd: PortablePath, argv: Array<string>): Promise<{exitCode: number | null, stdout: string, stderr: string}> {
  const out: Array<Buffer> = [];
  const err: Array<Buffer> = [];

  return new Promise((resolve, reject) => {
    if (process.env.RUN_CLI_ID)
      (process.env.RUN_CLI_ID as any)++;
    const child = spawn(process.execPath, [`--no-warnings`, `-r`, require.resolve(`./recordRequests.js`), require.resolve(`../dist/corepack.js`), ...argv], {
      cwd: npath.fromPortablePath(cwd),
      env: process.env,
      stdio: `pipe`,
    });

    child.stdout.on(`data`, chunk => {
      out.push(chunk);
    });

    child.stderr.on(`data`, chunk => {
      err.push(chunk);
    });

    child.on(`error`, error => {
      reject(error);
    });

    child.on(`close`, exitCode => {
      resolve({
        exitCode,
        stdout: Buffer.concat(out).toString(),
        stderr: Buffer.concat(err).toString(),
      });
    });
  });
}
