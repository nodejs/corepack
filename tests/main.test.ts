import {Filename, ppath, xfs} from '@yarnpkg/fslib';
import Enquirer               from 'enquirer';

import {defaultVersions}      from '../sources/config';
import {runCli}               from './_runCli';

for (const [name, version] of [[`yarn`, `1.22.4`], [`yarn`, `2.0.0-rc.30`], [`pnpm`, `4.11.6`], [`npm`, `6.14.2`]]) {
    it(`should use the right package manager version for a given project (${name}@${version})`, async () => {
        await xfs.mktempPromise(async cwd => {
            await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
                engines: {pm: `${name}@${version}`},
            });

            await expect(runCli(cwd, [name, `--version`])).resolves.toMatchObject({
                exitCode: 0,
                stdout: `${version}\n`,
            });
        });
    });
}

it(`shouldn't allow to use Yarn for npm-configured projects`, async () => {
    await xfs.mktempPromise(async cwd => {
        await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
            engines: {pm: `npm@6.14.2`},
        });

        await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
            exitCode: 1,
        });
    });
});

it(`should request for the project to be configured if it doesn't exist`, async () => {
    // @ts-ignore
    const spy = jest.spyOn(Enquirer, `prompt`, `get`)
        .mockReturnValue(() => Promise.resolve(true));

    await xfs.mktempPromise(async cwd => {
        await expect(runCli(cwd, [`yarn`])).resolves.toMatchObject({
            exitCode: 1,
        });

        await expect(spy).toHaveBeenCalledTimes(1);

        await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json` as Filename))).resolves.toEqual({
            engines: {
                pm: expect.stringMatching(/^yarn@/),
            },
        });
    });
});

it(`should use the pinned version when local projects don't list any spec`, async () => {
    // Note that we don't prevent using any package manager. This ensures that
    // projects will receive as little disruption as possible (for example, we
    // don't prompt to set the engines.pm field).

    await xfs.mktempPromise(async cwd => {
        await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
            // empty package.json file
        });

        await expect(runCli(cwd, [`yarn`, `--version`])).resolves.toMatchObject({
            stdout: `${defaultVersions.get(`yarn`)}\n`,
            exitCode: 0,
        });

        await expect(runCli(cwd, [`pnpm`, `--version`])).resolves.toMatchObject({
            stdout: `${defaultVersions.get(`pnpm`)}\n`,
            exitCode: 0,
        });

        await expect(runCli(cwd, [`npm`, `--version`])).resolves.toMatchObject({
            stdout: `${defaultVersions.get(`npm`)}\n`,
            exitCode: 0,
        });
    });
}, 30000);
