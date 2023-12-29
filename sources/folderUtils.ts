import {UsageError}                        from 'clipanion';
import {existsSync, mkdirSync, renameSync} from 'fs';
import {homedir, tmpdir}                   from 'os';
import {join}                              from 'path';
import process                             from 'process';

import type {NodeError}                    from './nodeUtils';

export function getInstallFolder() {
  if (process.env.COREPACK_HOME == null) {
    // TODO: remove this block on the next major.
    const oldCorepackDefaultHome = join(homedir(), `.node`, `corepack`);
    const newCorepackDefaultHome = join(
      process.env.XDG_CACHE_HOME ??
        process.env.LOCALAPPDATA ??
        join(
          homedir(),
          process.platform === `win32` ? `AppData/Local` : `.cache`,
        ),
      `node/corepack`,
    );
    if (
      existsSync(oldCorepackDefaultHome) &&
      !existsSync(newCorepackDefaultHome)
    ) {
      mkdirSync(newCorepackDefaultHome, {recursive: true});
      renameSync(oldCorepackDefaultHome, newCorepackDefaultHome);
    }
    return newCorepackDefaultHome;
  }
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
      } else if ((error as NodeError).code === `EACCES`) {
        throw new UsageError(`Failed to create cache directory. Please ensure the user has write access to the target directory (${target}). If the user's home directory does not exist, create it first.`);
      } else {
        throw error;
      }
    }
  }
}
