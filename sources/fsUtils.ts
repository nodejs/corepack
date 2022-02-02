import fs from 'fs';

export async function rimraf(path: string) {
  const [major, minor] = process.versions.node.split(`.`).map(section => Number(section));

  if (major > 14 || (major === 14 && minor >= 14)) {
    // rm was added in v14.14.0
    return fs.promises.rm(path, {recursive: true});
  } else if (major > 12 || (major === 12 && minor >= 10)) {
    // rmdir got support for recursive in v12.10.0 and was deprecated in v14.14.0
    return fs.promises.rmdir(path, {recursive: true});
  } else {
    const rimraf = await import(`rimraf`);
    return new Promise<void>((resolve, reject) => {
      rimraf.default(path, err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
