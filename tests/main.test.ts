import {Filename, ppath, xfs} from '@yarnpkg/fslib';
import Enquirer               from 'enquirer';

import config                 from '../config.json';
import {runCli}               from './_runCli';

for (const [name, version] of [[`yarn`, `1.22.4`], [`yarn`, `2.0.0-rc.30`], [`pnpm`, `4.11.6`], [`npm`, `6.14.2`]]) {
    it(`should use the right package manager version for a given project (${name}@${version})`, async () => {
        await xfs.mktempPromise(async cwd => {
            await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
                packageManager: `${name}@${version}`,
            });

            await expect(runCli(cwd, [name, name, `--version`])).resolves.toMatchObject({
                exitCode: 0,
                stdout: `${version}\n`,
            });
        });
    });
}

it(`shouldn't allow to use Yarn for npm-configured projects`, async () => {
    await xfs.mktempPromise(async cwd => {
        await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
            packageManager: `npm@6.14.2`,
        });

        await expect(runCli(cwd, [`yarn`, `yarn`, `--version`])).resolves.toMatchObject({
            exitCode: 1,
        });
    });
});

it(`should request for the project to be configured if it doesn't exist`, async () => {
    // @ts-ignore
    const spy = jest.spyOn(Enquirer, `prompt`, `get`)
        // @ts-ignore
        .mockReturnValue(() => Promise.resolve(true));

    await xfs.mktempPromise(async cwd => {
        await expect(runCli(cwd, [`yarn`, `yarn`])).resolves.toMatchObject({
            exitCode: 0,
        });

        await expect(spy).toHaveBeenCalledTimes(1);

        await expect(xfs.readJsonPromise(ppath.join(cwd, `package.json` as Filename))).resolves.toEqual({
            packageManager: expect.stringMatching(/^yarn@/),
        });
    });
});

it(`should use the pinned version when local projects don't list any spec`, async () => {
    // Note that we don't prevent using any package manager. This ensures that
    // projects will receive as little disruption as possible (for example, we
    // don't prompt to set the packageManager field).

    await xfs.mktempPromise(async cwd => {
        await xfs.writeJsonPromise(ppath.join(cwd, `package.json` as Filename), {
            // empty package.json file
        });

        await expect(runCli(cwd, [`yarn`, `yarn`, `--version`])).resolves.toMatchObject({
            stdout: `${config.definitions.yarn.default}\n`,
            exitCode: 0,
        });

        await expect(runCli(cwd, [`pnpm`, `pnpm`, `--version`])).resolves.toMatchObject({
            stdout: `${config.definitions.pnpm.default}\n`,
            exitCode: 0,
        });

        await expect(runCli(cwd, [`npm`, `npm`, `--version`])).resolves.toMatchObject({
            stdout: `${config.definitions.npm.default}\n`,
            exitCode: 0,
        });
    });
});
