import {spawn}                                                 from 'child_process';
import {UsageError}                                            from 'clipanion';
import {createWriteStream, mkdirSync, readdirSync, renameSync} from 'fs';
import {get}                                                   from 'https';
import {tmpdir}                                                from 'os';
import {dirname, join, posix}                                  from 'path';
import semver                                                  from 'semver';
import tar                                                     from 'tar';

import * as debugUtils                                         from './tools/debugUtils';
import * as folderUtils                                        from './tools/folderUtils';
import * as fsUtils                                            from './tools/fsUtils';
import * as httpUtils                                          from './tools/httpUtils';
import * as semverUtils                                        from './tools/semverUtils';

import {getAllVersions}                                        from './registry';

export async function runSpec(spec: {name: string, range: string}, name: string, args: string[]) {
    let versions = getInstalledVersions(spec);
    debugUtils.log(`Install folder is ${folderUtils.getInstallFolder()}`);

    if (versions.length > 0) {
        debugUtils.log(`Found ${versions.length} matching versions: ${versions.join(`, `)}`);
    } else {
        debugUtils.log(`Found no matching versions`);
        versions = await installLatest(spec);
    }

    const latest = semverUtils.maxVersion(versions);
    const bin = join(folderUtils.getInstallFolder(), spec.name, latest, `.bin`, name);

    return new Promise<number>((resolve, reject) => {
        process.on(`SIGINT`, () => {
            // We don't want to exit the process before the child, so we just
            // ignore SIGINT and wait for the regular exit to happen (the child
            // will receive SIGINT too since it's part of the same process grp)
        });

        const sub = spawn(process.execPath, [bin, ...args], {
            stdio: `inherit`,
        });

        sub.on(`exit`, exitCode => {
            resolve(exitCode !== null ? exitCode : 1);
        });
    });
}

function getInstalledVersions(spec: {name: string, range: string}) {
    const installFolder = join(folderUtils.getInstallFolder(), spec.name);
    const satisfyingVersions: string[] = [];

    let folderContent: string[];
    try {
        folderContent = readdirSync(installFolder);
    } catch (error) {
        if (error.code === `ENOENT`) {
            folderContent = [];
        } else {
            throw error;
        }
    }

    for (const entry of folderContent) {
        if (entry.startsWith(`.`))
            continue;
        if (!semver.satisfies(entry, spec.range))
            continue;
        satisfyingVersions.push(entry);
    }

    return satisfyingVersions;
}

async function installLatest(spec: {name: string, range: string}) {
    const allVersions = await getAllVersions();
    if (!Object.prototype.hasOwnProperty.call(allVersions, spec.name))
        throw new Error(`Unknown package manager type ${spec.name}`);

    const latest = semver.maxSatisfying(Object.keys(allVersions[spec.name]), spec.range) as string | null;
    if (latest === null)
        throw new UsageError(`Couldn't find a matching version for ${spec.name}@${spec.range}`);

    const pattern = allVersions._patterns[allVersions[spec.name][latest]];
    await installVersion(spec.name, latest, pattern);

    return [latest];
}

async function installVersion(name: string, version: string, pattern: {url: string, bin: string[] | {[name: string]: string}}) {
    const url = pattern.url.replace(`{}`, version);

    debugUtils.log(`Installing ${name}@${version} from ${url}`);
    const installFolder = join(folderUtils.getInstallFolder(), name, version);

    await fsUtils.mutex(installFolder, async () => {
        const tmpFolder = folderUtils.getTemporaryFolder();
        const stream = await httpUtils.fetchUrlStream(url);

        const parsedUrl = new URL(url);
        const ext = posix.extname(parsedUrl.pathname);

        let outputFile: string | null = null;

        let sendTo: any;
        if (ext === `.tgz`) {
            sendTo = tar.x({strip: 1, cwd: tmpFolder});
        } else if (ext === `.js`) {
            outputFile = join(tmpFolder, posix.basename(parsedUrl.pathname));
            sendTo = createWriteStream(outputFile);
        }

        stream.pipe(sendTo);

        return new Promise((resolve, reject) => {
            sendTo.on(`finish`, resolve);
        }).then(() => {
            mkdirSync(join(tmpFolder, `.bin`));

            if (Array.isArray(pattern.bin)) {
                if (outputFile !== null) {
                    for (const name of pattern.bin) {
                        fsUtils.makeShim(join(tmpFolder, `.bin`, name), outputFile);
                    }
                } else {
                    throw new Error(`Assertion failed`);
                }
            } else {
                for (const [name, dest] of Object.entries(pattern.bin)) {
                    fsUtils.makeShim(join(tmpFolder, `.bin`, name), join(tmpFolder, dest));
                }
            }

            mkdirSync(dirname(installFolder), {recursive: true});
            renameSync(tmpFolder, installFolder);

            debugUtils.log(`Install finished`);
        });
    });
}
