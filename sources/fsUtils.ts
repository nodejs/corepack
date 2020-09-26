import fs                  from 'fs';
import {dirname, relative} from 'path';

export async function mutex<T>(p: string, cb: () => Promise<T>) {
  return await cb();
}

export async function makeShim(target: string, path: string) {
  await fs.promises.symlink(relative(dirname(target), path), target, `file`);
}
