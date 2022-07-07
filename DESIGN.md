## What problem does it solve?

Various problems arise from npm being the only package manager shipped by default:

- Projects using popular package management solutions other than npm (particularly Yarn and pnpm) require additional installation step that must often be repeated when switching between Node versions. This lead to a significant part of the Node userbase effectively being a second-class citizen, which sounds unfortunate.

- Because one package manager currently holds a special treatment, users are more likely to pick it even if they would choose another solution should they have the choice (it really depends on how they balance the tradeoffs, but sometimes they value simplicity over purely technical factors). This artificial barrier hurts our community by making it harder to pick the right tool for the job.

- Having a single official package manager means that all the keys belong to a single player which can do whatever it pleases with it (even the Node project only has a limited influence over it, since removing the unique package manager would be poorly accepted by the community). Spreading these responsibilities over multiple projects gives less power to each, ensuring that everyone behave well.

Discussion thread: https://github.com/nodejs/node/issues/15244

## Envisioned workflow

1. Users would install Node as usual.

2. Node would be distributed slightly differently:

    - Corepack would be included by Node out of the box.

    - The full npm package wouldn't be included out of the box anymore (this might be an incremental move, with first a major version shipping Corepack + npm, and the next one discarding npm).

    - **However**, the Node distribution would include jump binaries for all three main package managers (`yarn`, `npm`, and `pnpm`) that would simply delegate to `corepack <package manager name>`. Corepack would then handle the install logic by following the logic described in later sections.

    - Corepack could potentially be distributed as a Node subcommand rather than a standalone binary. In this case, commands in this document (such as `corepack install <name@version>`) would be replaced by `node --corepack install <name@version>` (or any other variant).

3. Regular users would keep using the `yarn` / `npm` / `pnpm` global binaries just like they are used to. The one difference is that the package manager implementations would be lazily downloaded, without having to be manually installed (because the global jumpers would be included in the Node distribution, cf previous point).

    - Projects that don't list the `packageManager` field would allow any package manager, and Corepack would install them based on predefined versions. Those versions will be frozen in time within Corepack itself to "known good values". For example, the default npm version could be 6.14.5, and the default Yarn one 1.22.4. Users that would want to upgrade to higher versions would just have to update the `packageManager` field (cf next section).

4. Project authors would most of the time only have to care about the binaries as well, but they would be able to upgrade package manager versions simply by changing the versions set in the `packageManager` field.

    - Corepack could reasonably provide some kind of basic CLI interface to select a version to upgrade to in a few keystrokes (similar to what `emsdk` does for the [emscripten toolchain](https://github.com/emscripten-core/emsdk#how-do-i-check-for-updates-to-the-emscripten-sdk), or what [nvm](https://github.com/nvm-sh/nvm) does for Node releases).

5. Docker users would follow a similar workflow to other users; the default image would run network queries to install the right package manager for the project being installed.

    - However, users with strong offline requirements would be able to run the `corepack install <name@version>` command when preparing their images. It would ensure that the requested package manager is made available for later use.

    - Network access could be disabled entirely by setting `COREPACK_ENABLE_NETWORK=0` in the environment - Corepack would then only use the package managers that got installed by prior `corepack install` calls.

6. Package manager maintainers would submit a PR to the Node repository each time they wish for a new version to be made available through Corepack (can be easily automated using a GitHub Action on each of our repositories). Merging the PR would instantly make the new version available to Node users (once they upgrade).

## How does it work?

When any of the embed binaries are called (whether it's `yarn`, `npm`, or `pnpm`), the tool will find the closest ancestor `package.json` for the current directory. It will then extract the `packageManager` key, configured as such:

```json
{
  "packageManager": "yarn@2.0.0"
}
```

The tool will then check whether it got called via the right binary endpoint (`npm` or `npx` when the package manager is configured for npm, `yarn` when configured for Yarn, etc), and will report an error otherwise. This ensures that we can't accidentally call, say, pnpm on an npm project (which would otherwise lead to diverging environments since the lockfiles and features wouldn't be the same depending on the interpreting package managers).

If the check succeeded, the tool will check whether a compatible package manager has been installed (they're all stored on the disk in the local user's home folder). If not, it will install the latest matching release (based on the information dynamically retrieved from [`versions.json`](/versions.json)). Once it has ensured that a version exists, it'll forward the call to it.

## Frequently asked questions

**Why not just ask the user which package manager they want to use when installing Node?**

Whether to use npm or Yarn or pnpm isn't up to the user but to each individual project. Different projects leverage different features from different package managers. For example one project might rely on the Yarn workspaces, whereas another has setup their repository with pnpm in mind.

**How would things work with global packages?**

Nothing would change in the context of this particular proposal. Npm would keep installing its globals alongside Node, and Yarn would keep installing them into the user's home directory.

**Why not just keep only npm?**

While npm is favored by the majority of the ecosystem, a significant portion decided to use different tools. Their use cases deserve to be heard rather than be discarded simply because a slightly higher percentage of users happens not to directly benefit from it. Additionally, keeping powers balanced is important - even more so given that npm is a corporate entity with little oversight.

From the npm perspective, a project such as Corepack would also have its benefits: projects regularly break when upgrading from one Node version to another because of npm being upgraded as well. By pinning the package manager version, they would ensure that their users only upgrade when they are ready to, decreasing accidental frustration.

## Known issues

- The `pnpx` and `npx` binaries can only be called from within pnpm and npm projects, respectively. This is because otherwise we cannot infer the package manager version from the local manifest, as it would list another package manager instead. Fixing that is possible if we include "global installs" features inside corepack (so that we would fallback to the global `npx` in those circumstances). It seemed out of scope for the initial prototype, but we certainly can discuss it in an issue.
