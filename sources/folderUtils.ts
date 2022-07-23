import {mkdirSync}       from 'fs';
import {homedir, tmpdir} from 'os';
import {join}            from 'path';
import process           from 'process';

import type {NodeError}  from './nodeUtils';

export function getInstallFolder() {
  return (
    process.env.COREPACK_HOME ??
    join(
      process.env.XDG_CACHE_HOME ??
        process.env.LOCALAPPDATA ??
        join(homedir(), process.platform === `win32` ? `AppData/Local` : `.cache`),
      `node/corepack`,
    )
  );
}

export function getTemporaryFolder(target: string = tmpdir()) {
  mkdirSync(target, {recursive: true});

  while (true) {
    const rnd = Math.random() * 0x100000000;
    const hex = rnd.toString(16).padStart(8, `0`);
    const path = join(target, `corepack-${process.pid}-${hex}`);

    try {
      mkdirSync(path);
      return path;
    } catch (error) {
      if ((error as NodeError).code === `EEXIST`) {
        continue;
      } else {
        throw error;
      }
    }
  }
}
