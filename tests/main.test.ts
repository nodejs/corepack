import {Filename, ppath, xfs} from '@yarnpkg/fslib';

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
