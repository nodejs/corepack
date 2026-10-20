import {Buffer}                                          from 'node:buffer';
import {mkdtemp, mkdir, rm, writeFile}                   from 'node:fs/promises';
import os                                                from 'node:os';
import path                                              from 'node:path';
import process                                           from 'node:process';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {fetchAsJson, fetchUrlStream}                     from '../sources/httpUtils.ts';
import {fetchAsJson as fetchMetadata}                    from '../sources/npmRegistryUtils.ts';

describe(`HTTP registry authentication`, () => {
  let fixture: string;
  const request = vi.fn<typeof globalThis.fetch>();

  beforeEach(async () => {
    fixture = await mkdtemp(path.join(__dirname, `.npmrc-auth-`));
    const project = path.join(fixture, `project`);
    await mkdir(project);
    await writeFile(path.join(project, `package.json`), `{}`);
    process.env.npm_config_userconfig = path.join(fixture, `user.npmrc`);
    process.env.COREPACK_NPM_REGISTRY = `https://registry.example.com/npm/`;
    vi.spyOn(process, `cwd`).mockReturnValue(project);
    request.mockReset().mockImplementation(async () => new Response(`{}`));
    vi.stubGlobal(`fetch`, request);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await rm(fixture, {recursive: true, force: true});
  });

  async function writeProjectConfig(content: string) {
    await writeFile(path.join(fixture, `project`, `.npmrc`), content);
  }

  function authorization(index = 0) {
    return new Headers(request.mock.calls[index][1]?.headers).get(`authorization`);
  }

  it.each([`metadata`, `tarball`])(`reads a user token for %s requests`, async kind => {
    await writeFile(process.env.npm_config_userconfig!, `//registry.example.com/npm/:_authToken=user-token\n`);

    if (kind === `metadata`) {
      await fetchMetadata(`pnpm`, `latest`);
      expect(new Headers(request.mock.calls[0][1]?.headers).get(`accept`)).toContain(`application/vnd.npm.install-v1+json`);
    } else {
      const stream = await fetchUrlStream(`https://registry.example.com/npm/pnpm/-/pnpm.tgz`);
      for await (const chunk of stream) {
        expect(chunk.toString()).toBe(`{}`);
      }
    }

    expect(authorization()).toBe(`Bearer user-token`);
  });

  it(`reads the uppercase user config override`, async () => {
    process.env.NPM_CONFIG_USERCONFIG = process.env.npm_config_userconfig;
    delete process.env.npm_config_userconfig;
    await writeFile(process.env.NPM_CONFIG_USERCONFIG!, `//registry.example.com/npm/:_authToken=user-token`);
    await fetchMetadata(`pnpm`);
    expect(authorization()).toBe(`Bearer user-token`);
  });

  it(`lets project config override user config from a project subdirectory`, async () => {
    await writeFile(process.env.npm_config_userconfig!, `//registry.example.com/npm/:_authToken=user-token`);
    await writeProjectConfig(`//registry.example.com/npm/:_authToken=project-token`);
    vi.mocked(process.cwd).mockReturnValue(path.join(fixture, `project`, `src`));
    await fetchMetadata(`pnpm`);
    expect(authorization()).toBe(`Bearer project-token`);
  });

  it(`ignores dependency config and uses the enclosing project`, async () => {
    const dependency = path.join(fixture, `project`, `node_modules`, `dependency`);
    await mkdir(dependency, {recursive: true});
    await writeFile(path.join(dependency, `.npmrc`), `//registry.example.com/npm/:_authToken=dependency-token`);
    await writeProjectConfig(`//registry.example.com/npm/:_authToken=project-token`);
    vi.mocked(process.cwd).mockReturnValue(dependency);
    await fetchMetadata(`pnpm`);
    expect(authorization()).toBe(`Bearer project-token`);
  });

  it(`stops searching at a project boundary`, async () => {
    await writeFile(path.join(fixture, `.npmrc`), `//registry.example.com/npm/:_authToken=parent-token`);
    await fetchMetadata(`pnpm`);
    expect(authorization()).toBeNull();
  });

  it(`uses the default user config in the home directory`, async () => {
    delete process.env.npm_config_userconfig;
    delete process.env.NPM_CONFIG_USERCONFIG;
    vi.spyOn(os, `homedir`).mockReturnValue(fixture);
    await writeFile(path.join(fixture, `.npmrc`), `//registry.example.com/npm/:_authToken=home-token`);
    await fetchMetadata(`pnpm`);
    expect(authorization()).toBe(`Bearer home-token`);
  });

  it(`prefers the most specific registry path`, async () => {
    await writeProjectConfig(`//registry.example.com/npm/private/:_authToken=private-token\n//registry.example.com/npm/:_authToken=registry-token`);
    await fetchAsJson(`https://registry.example.com/npm/private/pnpm`);
    await fetchMetadata(`pnpm`);
    expect(authorization()).toBe(`Bearer private-token`);
    expect(authorization(1)).toBe(`Bearer registry-token`);
  });

  it.each([
    [`_auth=dXNlcjpwYXNz`, `Basic dXNlcjpwYXNz`],
    [`username=user\n//registry.example.com/npm/:_password=cGFzcw==`, `Basic dXNlcjpwYXNz`],
    [`username=user\n//registry.example.com/npm/:_password=`, `Basic dXNlcjo=`],
  ])(`supports npmrc Basic authentication: %s`, async (config, expected) => {
    await writeProjectConfig(`//registry.example.com/npm/:${config}`);
    await fetchMetadata(`pnpm`);
    expect(authorization()).toBe(expected);
  });

  it(`interpolates environment variables in quoted tokens and Basic credentials`, async () => {
    process.env.TEST_NPM_TOKEN = `test-token`;
    process.env.TEST_NPM_USERNAME = `user`;
    process.env.TEST_NPM_PASSWORD = `cGFzcw==`;
    await writeProjectConfig(`; comment\n//registry.example.com/npm/:_authToken="\${TEST_NPM_TOKEN}"\n//registry.example.com/basic/:username=\${TEST_NPM_USERNAME}\n//registry.example.com/basic/:_password=\${TEST_NPM_PASSWORD} # comment`);
    await fetchMetadata(`pnpm`);
    await fetchAsJson(`https://registry.example.com/basic/pnpm`);
    expect(authorization()).toBe(`Bearer test-token`);
    expect(authorization(1)).toBe(`Basic dXNlcjpwYXNz`);
  });

  it(`does not send unresolved environment variables or unscoped credentials`, async () => {
    delete process.env.TEST_MISSING_NPM_TOKEN;
    await writeProjectConfig(`_authToken=global-token\n_auth=dXNlcjpwYXNz\nusername=user\n_password=cGFzcw==\n//registry.example.com/npm/:_authToken=\${TEST_MISSING_NPM_TOKEN}`);
    await fetchMetadata(`pnpm`);
    expect(authorization()).toBeNull();
  });

  it(`requires both npmrc username and password`, async () => {
    await writeProjectConfig(`//registry.example.com/npm/:username=user`);
    await fetchMetadata(`pnpm`);
    expect(authorization()).toBeNull();
  });

  it(`ignores malformed registry scopes`, async () => {
    await writeProjectConfig(`//user:pass@registry.example.com/npm/:_authToken=invalid-token\n//registry.example.com/npm/?query/:_authToken=invalid-token\n//registry.example.com/npm/#fragment/:_authToken=invalid-token\n//[invalid/npm/:_authToken=invalid-token`);
    await fetchMetadata(`pnpm`);
    expect(authorization()).toBeNull();
  });

  it.each([`token`, `Basic`])(`prefers explicit %s credentials over npmrc`, async kind => {
    await writeProjectConfig(`//registry.example.com/npm/:_authToken=project-token`);
    process.env.COREPACK_NPM_USERNAME = `user`;
    process.env.COREPACK_NPM_PASSWORD = `pass`;
    if (kind === `token`)
      process.env.COREPACK_NPM_TOKEN = `explicit-token`;
    await fetchMetadata(`pnpm`);
    await fetchUrlStream(`https://registry.example.com/npm/pnpm.tgz`);
    expect(authorization()).toBe(kind === `token` ? `Bearer explicit-token` : `Basic dXNlcjpwYXNz`);
    expect(authorization(1)).toBe(authorization());
  });

  it(`allows an explicitly empty Basic password`, async () => {
    process.env.COREPACK_NPM_USERNAME = `user`;
    process.env.COREPACK_NPM_PASSWORD = ``;
    await fetchMetadata(`pnpm`);
    expect(authorization()).toBe(`Basic dXNlcjo=`);
  });

  it(`falls back to npmrc when explicit Basic credentials are incomplete`, async () => {
    process.env.COREPACK_NPM_USERNAME = `user`;
    await writeProjectConfig(`//registry.example.com/npm/:_authToken=project-token`);
    await fetchMetadata(`pnpm`);
    expect(authorization()).toBe(`Bearer project-token`);
  });

  it.each([`npmrc`, `token`, `Basic`, `registry URL`])(`restricts %s credentials to the registry host, port, and path`, async kind => {
    if (kind === `npmrc`) {
      await writeProjectConfig(`//registry.example.com/npm/:_authToken=project-token`);
    } else if (kind === `token`) {
      process.env.COREPACK_NPM_TOKEN = `explicit-token`;
    } else if (kind === `Basic`) {
      process.env.COREPACK_NPM_USERNAME = `user`;
      process.env.COREPACK_NPM_PASSWORD = `pass`;
    } else {
      process.env.COREPACK_NPM_REGISTRY = `https://user:pass@registry.example.com/npm/`;
    }

    for (const url of [
      `https://other.example.com/npm/pnpm`,
      `https://registry.example.com.evil.example/npm/pnpm`,
      `https://registry.example.com:8443/npm/pnpm`,
      `https://registry.example.com/other/pnpm`,
      `https://registry.example.com/npm-other/pnpm`,
      `https://registry.example.com/npm/../other/pnpm`,
    ]) {
      await fetchAsJson(url);
      expect(authorization(request.mock.calls.length - 1)).toBeNull();
    }
    await fetchMetadata(`pnpm`);
    expect(authorization(request.mock.calls.length - 1)).not.toBeNull();
  });

  it.each([`token`, `Basic`])(`does not send explicit %s credentials over another protocol`, async kind => {
    if (kind === `token`) {
      process.env.COREPACK_NPM_TOKEN = `explicit-token`;
    } else {
      process.env.COREPACK_NPM_USERNAME = `user`;
      process.env.COREPACK_NPM_PASSWORD = `pass`;
    }
    await fetchAsJson(`http://registry.example.com/npm/pnpm`);
    expect(authorization()).toBeNull();
  });

  it(`decodes URL credentials without mutating the caller's URL`, async () => {
    const url = new URL(`https://user%40example.com:p%40ss@other.example.com/package`);
    await fetchAsJson(url);
    expect(authorization()).toBe(`Basic ${Buffer.from(`user@example.com:p@ss`).toString(`base64`)}`);
    expect(url.username).toBe(`user%40example.com`);
    expect((request.mock.calls[0][0] as URL).username).toBe(``);
  });

  it(`preserves headers supplied as a Headers object`, async () => {
    process.env.COREPACK_NPM_TOKEN = `explicit-token`;
    await fetchAsJson(`https://registry.example.com/npm/pnpm`, {headers: new Headers({accept: `application/json`})});
    expect(new Headers(request.mock.calls[0][1]?.headers).get(`accept`)).toBe(`application/json`);
    expect(authorization()).toBe(`Bearer explicit-token`);
  });

  for (const kind of [`npmrc`, `token`, `Basic`, `registry URL`]) {
    it.each([
      `/npm/pnpm.tgz`,
      `/other/pnpm.tgz`,
      `/npm-other/pnpm.tgz`,
      `https://other.example.com/npm/pnpm.tgz`,
      `https://registry.example.com:8443/npm/pnpm.tgz`,
    ])(`re-evaluates ${kind} credentials on a redirect to %s`, async location => {
      if (kind === `npmrc`) {
        await writeProjectConfig(`//registry.example.com/npm/:_authToken=project-token`);
      } else if (kind === `token`) {
        process.env.COREPACK_NPM_TOKEN = `explicit-token`;
      } else if (kind === `Basic`) {
        process.env.COREPACK_NPM_USERNAME = `user`;
        process.env.COREPACK_NPM_PASSWORD = `pass`;
      } else {
        process.env.COREPACK_NPM_REGISTRY = `https://user:pass@registry.example.com/npm/`;
      }
      request.mockResolvedValueOnce(new Response(null, {status: 302, headers: {location}}));
      await fetchUrlStream(`https://registry.example.com/npm/pnpm`);
      expect(request.mock.calls[0][1]?.redirect).toBe(`manual`);
      expect(authorization()).not.toBeNull();
      expect(authorization(1)).toBe(location === `/npm/pnpm.tgz` ? authorization() : null);
    });
  }

  it(`does not broaden supplied authorization scope across redirects`, async () => {
    request.mockResolvedValueOnce(new Response(null, {status: 302, headers: {location: `/npm/private`}}));
    request.mockResolvedValueOnce(new Response(null, {status: 302, headers: {location: `/npm/public/pnpm.tgz`}}));
    await fetchUrlStream(`https://registry.example.com/npm/private/pnpm`, {headers: {authorization: `Bearer supplied-token`}});
    expect(authorization()).toBe(`Bearer supplied-token`);
    expect(authorization(1)).toBe(`Bearer supplied-token`);
    expect(authorization(2)).toBeNull();
  });

  it.each([301, 302, 303])(`switches POST to GET on a %s redirect`, async status => {
    request.mockResolvedValueOnce(new Response(null, {status, headers: {location: `/npm/pnpm.tgz`}}));
    await fetchAsJson(`https://registry.example.com/npm/pnpm`, {method: `POST`, body: `payload`, headers: {accept: `application/json`, 'content-type': `text/plain`}});
    expect(request.mock.calls[1][1]).toMatchObject({method: `GET`, body: undefined});
    const headers = new Headers(request.mock.calls[1][1]?.headers);
    expect(headers.get(`content-type`)).toBeNull();
    expect(headers.get(`accept`)).toBe(`application/json`);
  });

  it.each([307, 308])(`preserves POST and its body on a %s redirect`, async status => {
    request.mockResolvedValueOnce(new Response(null, {status, headers: {location: `/npm/pnpm.tgz`}}));
    await fetchAsJson(`https://registry.example.com/npm/pnpm`, {method: `POST`, body: `payload`, headers: {'content-type': `text/plain`}});
    expect(request.mock.calls[1][1]).toMatchObject({method: `POST`, body: `payload`});
    expect(new Headers(request.mock.calls[1][1]?.headers).get(`content-type`)).toBe(`text/plain`);
  });

  it(`selects the target registry's own credentials on a redirect`, async () => {
    await writeProjectConfig(`//registry.example.com/npm/:_authToken=project-token\n//other.example.com/npm/:_authToken=other-token`);
    request.mockResolvedValueOnce(new Response(null, {status: 302, headers: {location: `https://other.example.com/npm/pnpm.tgz`}}));
    await fetchUrlStream(`https://registry.example.com/npm/pnpm`);
    expect(authorization()).toBe(`Bearer project-token`);
    expect(authorization(1)).toBe(`Bearer other-token`);
  });

  it(`limits redirect loops`, async () => {
    request.mockImplementation(async () => new Response(null, {status: 302, headers: {location: `/npm/pnpm`}}));
    await expect(fetchMetadata(`pnpm`)).rejects.toThrow(`Too many redirects`);
    expect(request).toHaveBeenCalledTimes(21);
  });
});
