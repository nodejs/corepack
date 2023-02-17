import {rm} from 'fs/promises';

export async function rimraf(path: string) {
  return rm(path, {recursive: true, force: true});
}
