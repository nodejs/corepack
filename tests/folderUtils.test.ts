import {homedir}                                 from 'os';
import {join}                                    from 'path';
import process                                   from 'process';
import {beforeEach, describe, expect, it}        from 'vitest';

import {getCorepackHomeFolder, getInstallFolder} from '../sources/folderUtils.ts';

beforeEach(() => {
  delete process.env.COREPACK_HOME;
  delete process.env.XDG_CACHE_HOME;
  delete process.env.LOCALAPPDATA;
});

describe(`cache location`, () => {
  const localAppData = join(homedir(), `windows-cache`);
  const xdgCacheHome = join(homedir(), `xdg-cache`);
  const corepackHome = join(homedir(), `custom-corepack`);

  const cases: Array<{platform: NodeJS.Platform, env: NodeJS.ProcessEnv, expected: string}> = [
    {platform: `linux`, env: {}, expected: join(homedir(), `.cache/node/corepack`)},
    {platform: `linux`, env: {LOCALAPPDATA: localAppData}, expected: join(homedir(), `.cache/node/corepack`)},
    {platform: `darwin`, env: {LOCALAPPDATA: localAppData}, expected: join(homedir(), `.cache/node/corepack`)},
    {platform: `win32`, env: {LOCALAPPDATA: localAppData}, expected: join(localAppData, `node/corepack`)},
    {platform: `win32`, env: {}, expected: join(homedir(), `AppData/Local/node/corepack`)},
  ];

  for (const platform of [`linux`, `darwin`, `win32`] as const) {
    cases.push(
      {platform, env: {XDG_CACHE_HOME: xdgCacheHome, LOCALAPPDATA: localAppData}, expected: join(xdgCacheHome, `node/corepack`)},
      {platform, env: {COREPACK_HOME: corepackHome, XDG_CACHE_HOME: xdgCacheHome, LOCALAPPDATA: localAppData}, expected: corepackHome},
    );
  }

  it.each(cases)(`uses $expected on $platform with $env`, ({platform, env, expected}) => {
    const descriptor = Object.getOwnPropertyDescriptor(process, `platform`)!;
    Object.assign(process.env, env);
    Object.defineProperty(process, `platform`, {value: platform});
    try {
      expect(getCorepackHomeFolder()).toBe(expected);
      expect(getInstallFolder()).toBe(join(expected, `v1`));
    } finally {
      Object.defineProperty(process, `platform`, descriptor);
    }
  });
});
