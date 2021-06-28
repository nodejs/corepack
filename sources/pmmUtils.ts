import {StdioOptions, spawn}                              from 'child_process';
import fs                                                 from 'fs';
import path                                               from 'path';
import semver                                             from 'semver';

import * as debugUtils                                    from './debugUtils';
import * as folderUtils                                   from './folderUtils';
import * as fsUtils                                       from './fsUtils';
import * as httpUtils                                     from './httpUtils';
import {Context}                                          from './main';
import {TagSpec, Descriptor, Locator, PackageManagerSpec} from './types';

declare const __non_webpack_require__: unknown;

export async function fetchAvailableVersions(spec: TagSpec) {
  switch (spec.type) {
    case `npm`: {
      const data = await httpUtils.fetchAsJson(`https://registry.npmjs.org/${spec.package}`, {headers: {[`Accept`]: `application/vnd.npm.install-v1+json`}});
      return Object.keys(data.versions);
    }
    case `url`: {
      const data = await httpUtils.fetchAsJson(spec.url);
      const field = data[spec.field];
      return Array.isArray(field) ? field : Object.keys(field);
    }
    default: {
      throw new Error(`Unsupported specification ${JSON.stringify(spec)}`);
    }
  }
}

export async function findInstalledVersion(installTarget: string, descriptor: Descriptor) {
  const installFolder = path.join(installTarget, descriptor.name);

  let folderContent: Array<string>;
  try {
    folderContent = await fs.promises.readdir(installFolder);
  } catch (error) {
    if (error.code === `ENOENT`) {
      folderContent = [];
    } else {
      throw error;
    }
  }

  const candidateVersions: Array<string> = [];
  for (const entry of folderContent) {
    // Some dot-folders tend to pop inside directories, especially on OSX
    if (entry.startsWith(`.`))
      continue;

    candidateVersions.push(entry);
  }

  const bestMatch = semver.maxSatisfying(candidateVersions, descriptor.range);
  if (bestMatch === null)
    return null;

  return bestMatch;
}

export async function installVersion(installTarget: string, locator: Locator, {spec}: {spec: PackageManagerSpec}) {
  const {default: tar} = await import(/* webpackMode: 'eager' */ `tar`);

  const installFolder = path.join(installTarget, locator.name, locator.reference);
  if (fs.existsSync(installFolder)) {
    debugUtils.log(`Reusing ${locator.name}@${locator.reference}`);
    return installFolder;
  }

  const url = spec.url.replace(`{}`, locator.reference);
  debugUtils.log(`Installing ${locator.name}@${locator.reference} from ${url}`);

  return await fsUtils.mutex(installFolder, async () => {
    // Creating a temporary folder inside the install folder means that we
    // are sure it'll be in the same drive as the destination, so we can
    // just move it there atomically once we are done

    const tmpFolder = folderUtils.getTemporaryFolder(installTarget);
    const stream = await httpUtils.fetchUrlStream(url);

    const parsedUrl = new URL(url);
    const ext = path.posix.extname(parsedUrl.pathname);

    let outputFile: string | null = null;

    let sendTo: any;
    if (ext === `.tgz`) {
      sendTo = tar.x({strip: 1, cwd: tmpFolder});
    } else if (ext === `.js`) {
      outputFile = path.join(tmpFolder, path.posix.basename(parsedUrl.pathname));
      sendTo = fs.createWriteStream(outputFile);
    }

    stream.pipe(sendTo);

    await new Promise(resolve => {
      sendTo.on(`finish`, resolve);
    });

    await fs.promises.mkdir(path.dirname(installFolder), {recursive: true});
    await fs.promises.rename(tmpFolder, installFolder);

    debugUtils.log(`Install finished`);
    return installFolder;
  });
}

export async function runVersion(installSpec: { location: string, spec: PackageManagerSpec }, locator: Locator, binName: string, args: Array<string>, context: Context) {
  let binPath: string | null = null;
  if (Array.isArray(installSpec.spec.bin)) {
    if (installSpec.spec.bin.some(bin => bin === binName)) {
      const parsedUrl = new URL(installSpec.spec.url);
      const ext = path.posix.extname(parsedUrl.pathname);
      if (ext === `.js`) {
        binPath = path.join(installSpec.location, path.posix.basename(parsedUrl.pathname));
      }
    }
  } else {
    for (const [name, dest] of Object.entries(installSpec.spec.bin)) {
      if (name === binName) {
        binPath = path.join(installSpec.location, dest);
        break;
      }
    }
  }

  if (!binPath)
    throw new Error(`Assertion failed: Unable to locate path for bin '${binName}'`);

  return new Promise<number>((resolve, reject) => {
    process.on(`SIGINT`, () => {
      // We don't want to exit the process before the child, so we just
      // ignore SIGINT and wait for the regular exit to happen (the child
      // will receive SIGINT too since it's part of the same process grp)
    });

    const stdio: StdioOptions = [`pipe`, `pipe`, `pipe`];

    if (context.stdin === process.stdin)
      stdio[0] = `inherit`;
    if (context.stdout === process.stdout)
      stdio[1] = `inherit`;
    if (context.stderr === process.stderr)
      stdio[2] = `inherit`;

    const v8CompileCache = typeof __non_webpack_require__ !== `undefined`
      ? eval(`require`).resolve(`./vcc.js`)
      : eval(`require`).resolve(`corepack/dist/vcc.js`);

    const sub = spawn(process.execPath, [`--require`, v8CompileCache, binPath!, ...args], {
      cwd: context.cwd,
      stdio,
      env: {
        ...process.env,
        COREPACK_ROOT: path.dirname(eval(`__dirname`)),
      },
    });

    if (context.stdin !== process.stdin)
      context.stdin.pipe(sub.stdin!);
    if (context.stdout !== process.stdout)
      sub.stdout!.pipe(context.stdout);
    if (context.stderr !== process.stderr)
      sub.stderr!.pipe(context.stderr);

    sub.on(`exit`, exitCode => {
      resolve(exitCode !== null ? exitCode : 1);
    });
  });
}

