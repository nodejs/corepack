import {UsageError}      from 'clipanion';
import {mkdirSync}       from 'fs';
import {homedir, tmpdir} from 'os';
import {join}            from 'path';
import process           from 'process';

import type {NodeError}  from './nodeUtils';

/**
 * If the install folder structure changes then increment this number.
 */
const INSTALL_FOLDER_VERSION = 1;

export function getCorepackHomeFolder() {
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

export function getInstallFolder() {
  return join(
    getCorepackHomeFolder(),
    `v${INSTALL_FOLDER_VERSION}`,
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
      } else if ((error as NodeError).code === `EACCES`) {
        throw new UsageError(`Failed to create cache directory. Please ensure the user has write access to the target directory (${target}). If the user's home directory does not exist, create it first.`);
      } else {
        throw error;
      }
    }
  }
}
