# pmm

> A package manager manager - going full circle 🙂

## What problem does it solve?

https://github.com/nodejs/node/issues/15244

> **Why not just ask the user which package manager they want to use when installing Node?**
>
> Whether to use npm or Yarn or pnpm isn't up to the user but to each individual project. Different projects leverage different features from different package managers. For example one project might rely on the Yarn workspaces, whereas another has setup their repository with pnpm in mind.

## How does it work?

When any of the embed binaries are called, the tool will find the closest ancestor `package.json` for the current directory. It will then extract the `engines.pm` key, configured as such:

```json
{
  "engines": {
    "pm": "yarn@^2.0.0"
  }
}
```

The tool will then check whether it got called via the right binary endpoint, and will report an error otherwise (this ensures that we can't accidentally call pnpm on an npm project). If the check succeeded, the tool will check whether a compatible package manager has been installed (they're all stored on the disk in the local user's home folder). If not, it will install the latest matching release (based on the information dynamically retrieved from [`versions.json`](/versions.json)). Once it has ensured that a version exists, it'll forward the call to it.

## Known issues

- The `pnpx` and `npx` binaries can only be called from within pnpm and npm projects, respectively. This is because otherwise we cannot infer the package manager version from the local manifest, as it would list another package manager instead. Fixing that is possible if we include "global installs" features inside pmm (so that we would fallback to the global `npx` in those circumstances).
