import fs                                 from 'fs';
import os                                 from 'os';
import path                               from 'path';
import {beforeEach, describe, expect, it} from 'vitest';

import {readPackageBin}                   from '../sources/binUtils.ts';

let folder: string;

beforeEach(async () => {
  folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), `corepack-bin-`));
  await fs.promises.mkdir(path.join(folder, `dist`));
  await fs.promises.writeFile(path.join(folder, `dist`, `pnpm.mjs`), `export {};`);
  return () => fs.promises.rm(folder, {recursive: true, force: true});
});

async function writeManifest(manifest: unknown) {
  await fs.promises.writeFile(path.join(folder, `package.json`), JSON.stringify(manifest));
}

describe(`package executable paths`, () => {
  it(`reads changed paths and keeps only supported commands`, async () => {
    await writeManifest({bin: {pnpm: `./dist/pnpm.mjs`, pnpx: `dist/pnpm.mjs`, npm: `../outside.js`}});
    await expect(readPackageBin(folder, [`pnpm`, `pnpx`])).resolves.toEqual({pnpm: `dist/pnpm.mjs`, pnpx: `dist/pnpm.mjs`});
  });

  it(`omits aliases no longer published by the package`, async () => {
    await writeManifest({bin: {pnpm: `dist/pnpm.mjs`}});
    await expect(readPackageBin(folder, [`pnpm`, `pnpx`])).resolves.toEqual({pnpm: `dist/pnpm.mjs`});
  });

  it.each([`pnpm`, `@scope/pnpm`])(`uses the unscoped package name for string bins (%s)`, async name => {
    await writeManifest({name, bin: `dist/pnpm.mjs`});
    await expect(readPackageBin(folder, [`pnpm`, `pnpx`])).resolves.toEqual({pnpm: `dist/pnpm.mjs`});
  });

  it(`supports custom command names without a configured allowlist`, async () => {
    await writeManifest({bin: {custom: `dist/pnpm.mjs`}});
    await expect(readPackageBin(folder)).resolves.toEqual({custom: `dist/pnpm.mjs`});
  });

  it(`does not use inherited properties as aliases`, async () => {
    await writeManifest({bin: {pnpm: `dist/pnpm.mjs`}});
    await expect(readPackageBin(folder, [`pnpm`, `toString`, `constructor`])).resolves.toEqual({pnpm: `dist/pnpm.mjs`});
  });

  it(`keeps custom __proto__ entries as own data properties`, async () => {
    await writeManifest({bin: JSON.parse(`{"__proto__":"dist/pnpm.mjs"}`)});
    const bin = await readPackageBin(folder);
    expect(Object.keys(bin)).toEqual([`__proto__`]);
    expect(Object.getPrototypeOf(bin)).toBe(Object.prototype);
  });

  it.each([undefined, null, [], {}, 123, true])(`rejects invalid bin declarations (%j)`, async bin => {
    await writeManifest({bin});
    await expect(readPackageBin(folder)).rejects.toThrow(`Unable to locate bin in package.json`);
  });

  it(`rejects a string bin without a package name`, async () => {
    await writeManifest({bin: `dist/pnpm.mjs`});
    await expect(readPackageBin(folder)).rejects.toThrow(`Unable to locate bin in package.json`);
  });

  it(`rejects a manifest without any supported commands`, async () => {
    await writeManifest({bin: {npm: `dist/pnpm.mjs`}});
    await expect(readPackageBin(folder, [`pnpm`, `pnpx`])).rejects.toThrow(`Unable to locate supported bin`);
  });

  it.each([``, null, 123, {}, [], `/tmp/outside.js`, `C:/outside.js`, `C:outside.js`, `\\\\server\\outside.js`, `..\\outside.js`, `dist/pnpm.mjs\0`])(`rejects invalid entry paths (%j)`, async file => {
    await writeManifest({bin: {pnpm: file}});
    await expect(readPackageBin(folder)).rejects.toThrow(`expected a relative file path`);
  });

  it.each([`../outside.js`, `dist/../../outside.js`, `.`])(`rejects paths escaping or naming the package root (%s)`, async file => {
    await writeManifest({bin: {pnpm: file}});
    await expect(readPackageBin(folder)).rejects.toThrow(`path must stay inside the package`);
  });

  it(`rejects sibling paths that share the package directory prefix`, async () => {
    await writeManifest({bin: {pnpm: `../${path.basename(folder)}-other/cli.js`}});
    await expect(readPackageBin(folder)).rejects.toThrow(`path must stay inside the package`);
  });

  it(`rejects missing executable files`, async () => {
    await writeManifest({bin: {pnpm: `missing.js`}});
    await expect(readPackageBin(folder)).rejects.toThrow(`Unable to locate bin 'pnpm'`);
  });

  it(`rejects directories as entry points`, async () => {
    await writeManifest({bin: {pnpm: `dist`}});
    await expect(readPackageBin(folder)).rejects.toThrow(`expected a file`);
  });

  it(`rejects malformed manifest JSON`, async () => {
    await fs.promises.writeFile(path.join(folder, `package.json`), `{`);
    await expect(readPackageBin(folder)).rejects.toThrow(SyntaxError);
  });

  it(`rejects a missing package manifest`, async () => {
    await expect(readPackageBin(folder)).rejects.toThrow(`Unable to locate package manifest`);
  });

  // Windows permits directory junctions without the privileges required for file symlinks.
  it(`accepts symlinks contained in the package and caches the resolved path`, async () => {
    await fs.promises.symlink(path.join(folder, `dist`), path.join(folder, `alias`), `junction`);
    await writeManifest({bin: {pnpm: `alias/pnpm.mjs`}});
    await expect(readPackageBin(folder)).resolves.toEqual({pnpm: `dist/pnpm.mjs`});
  });

  it(`accepts a package root reached through a symlink`, async () => {
    await fs.promises.symlink(path.join(folder, `dist`), path.join(folder, `alias`), `junction`);
    await fs.promises.writeFile(path.join(folder, `dist`, `package.json`), JSON.stringify({bin: {pnpm: `pnpm.mjs`}}));
    await expect(readPackageBin(path.join(folder, `alias`))).resolves.toEqual({pnpm: `pnpm.mjs`});
  });

  it(`rejects symlinked entry points outside the package`, async () => {
    await fs.promises.symlink(path.dirname(folder), path.join(folder, `outside`), `junction`);
    // Use a separate sibling package file so realpath cannot return inside this package.
    const outside = await fs.promises.mkdtemp(path.join(path.dirname(folder), `corepack-bin-outside-`));
    try {
      await fs.promises.writeFile(path.join(outside, `cli.js`), ``);
      await writeManifest({bin: {pnpm: `outside/${path.basename(outside)}/cli.js`}});
      await expect(readPackageBin(folder)).rejects.toThrow(`path must stay inside the package`);
    } finally {
      await fs.promises.rm(outside, {recursive: true, force: true});
    }
  });

  it(`rejects package manifests symlinked outside the package`, async () => {
    const outside = await fs.promises.mkdtemp(path.join(path.dirname(folder), `corepack-manifest-outside-`));
    try {
      await fs.promises.writeFile(path.join(outside, `package.json`), JSON.stringify({bin: {pnpm: `dist/pnpm.mjs`}}));
      // A manifest file symlink requires privileges on Windows; a directory named package.json is still invalid.
      await fs.promises.symlink(outside, path.join(folder, `package.json`), `junction`);
      await expect(readPackageBin(folder)).rejects.toThrow(`path must stay inside the package`);
    } finally {
      await fs.promises.rm(outside, {recursive: true, force: true});
    }
  });
});
