import {UsageError}   from 'clipanion';
import fs             from 'fs';
import path           from 'path';

import type {BinSpec} from './types.ts';

function isInside(folder: string, target: string) {
  const relative = path.relative(folder, target);
  return relative !== `` && relative !== `..` && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function resolvePackageFile(folder: string, file: unknown, description: string) {
  if (typeof file !== `string` || file.length === 0 || /[\\:\0]/.test(file) || path.posix.isAbsolute(file))
    throw new UsageError(`Invalid ${description} in package.json: expected a relative file path`);

  const target = path.resolve(folder, file);
  if (!isInside(folder, target))
    throw new UsageError(`Invalid ${description} in package.json: path must stay inside the package`);

  let resolved: string;
  try {
    resolved = await fs.promises.realpath(target);
  } catch {
    throw new UsageError(`Unable to locate ${description} in the downloaded package`);
  }

  if (!isInside(folder, resolved))
    throw new UsageError(`Invalid ${description} in package.json: path must stay inside the package`);

  if (!(await fs.promises.stat(resolved)).isFile())
    throw new UsageError(`Invalid ${description} in package.json: expected a file`);

  return path.relative(folder, resolved).split(path.sep).join(`/`);
}

export async function readPackageBin(folder: string, allowedNames?: Array<string>): Promise<BinSpec> {
  // Resolve the package root too: the cache itself may be reached through a symlink.
  const packageRoot = await fs.promises.realpath(folder);
  const manifestPath = await resolvePackageFile(packageRoot, `package.json`, `package manifest`);
  const manifest = JSON.parse(await fs.promises.readFile(path.join(packageRoot, manifestPath), `utf8`));
  const packageBin = typeof manifest?.bin === `string`
    ? typeof manifest.name === `string` && manifest.name.length > 0
      ? {[manifest.name.replace(/^@[^/]+\//, ``)]: manifest.bin}
      : null
    : manifest?.bin;

  if (typeof packageBin !== `object` || packageBin === null || Array.isArray(packageBin) || Object.keys(packageBin).length === 0)
    throw new UsageError(`Unable to locate bin in package.json`);

  const bin: BinSpec = {};
  for (const name of allowedNames ?? Object.keys(packageBin)) {
    // Optional aliases may disappear between releases. Never inherit an entry.
    if (!Object.hasOwn(packageBin, name))
      continue;

    const file = await resolvePackageFile(packageRoot, packageBin[name], `bin '${name}'`);
    Object.defineProperty(bin, name, {value: file, enumerable: true});
  }

  if (Object.keys(bin).length === 0)
    throw new UsageError(`Unable to locate supported bin in package.json`);

  return bin;
}
