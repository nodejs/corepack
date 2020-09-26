import {mkdirSync}       from 'fs';
import {homedir, tmpdir} from 'os';
import {join}            from 'path';

export function getInstallFolder() {
  return process.env.COREPACK_HOME ?? join(homedir(), `.node/corepack`);
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
      if (error.code === `EEXIST`) {
        continue;
      } else {
        throw error;
      }
    }
  }
}
