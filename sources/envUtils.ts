import fs              from 'fs';
import os              from 'os';
import path            from 'path';
import {parseEnv}      from 'util';

import * as debugUtils from './debugUtils.ts';
import {isNodeError}   from './nodeUtils.ts';

// Remember which values came from the user file so project configuration can
// override them without overriding variables supplied by the calling process.
const userDefaults = new WeakMap<NodeJS.ProcessEnv, Record<string, string>>();

export async function loadUserConfig() {
  const configuredPath = process.env.COREPACK_CONFIG_FILE;
  if (configuredPath === `0`)
    return;

  const configPath = configuredPath ?? path.join(os.homedir(), `.corepackrc`);
  let content: string;
  try {
    content = await fs.promises.readFile(configPath, `utf8`);
  } catch (error) {
    if (isNodeError(error) && error.code === `ENOENT` && configuredPath === undefined)
      return;
    throw error;
  }

  const defaults: Record<string, string> = {};
  for (const [key, value] of Object.entries(parseEnv(content))) {
    if (value === undefined)
      continue;

    if (key.startsWith(`COREPACK_`) && key !== `COREPACK_CONFIG_FILE` && process.env[key] === undefined) {
      defaults[key] = value;
      process.env[key] = value;
    }
  }
  userDefaults.set(process.env, defaults);
  debugUtils.log(`Loaded user configuration from ${configPath}`);
}

export function mergeProjectEnv(content: string): NodeJS.ProcessEnv {
  const env = {...process.env};
  const defaults = userDefaults.get(process.env);

  for (const [key, value] of Object.entries(parseEnv(content))) {
    if (!key.startsWith(`COREPACK_`) || key === `COREPACK_CONFIG_FILE` || key === `COREPACK_ENV_FILE` || key === `COREPACK_ENABLE_DOWNLOAD_PROMPT`)
      continue;

    if (env[key] === undefined || (defaults && Object.hasOwn(defaults, key) && defaults[key] === env[key])) {
      env[key] = value;
    }
  }

  return env;
}
