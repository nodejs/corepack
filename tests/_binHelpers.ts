import {Filename, ppath, xfs, PortablePath} from '@yarnpkg/fslib';

export async function makeBin(cwd: PortablePath, name: Filename, {ignorePlatform = false}: {ignorePlatform?: boolean} = {}) {
  let path = ppath.join(cwd, name);
  if (process.platform === `win32` && !ignorePlatform)
    path = `${path}.CMD` as PortablePath;

  await xfs.writeFilePromise(path, ``);
  await xfs.chmodPromise(path, 0o755);

  return path;
}

export function getBinaryNames(name: string) {
  if (process.platform !== `win32`)
    return [name];

  return [
    `${name}`,
    `${name}.CMD`,
    `${name}.ps1`,
  ];
}
