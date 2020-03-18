# pmm

> A package manager manager - going full circle 🙂

## Usage

1. Clone this repository
2. Run `yarn build` (no need for `yarn install`)
3. The `dist/` directory now contains the pmm build and the shims
4. Call `node ./dist/pmm --version` and behold

You can also run the tests with `yarn jest` (still no install needed).

## What problem does it solve?

Various problems arise from npm being the only package manager shipped by default:

- Projects using popular package management solutions other than npm (particularly Yarn and pnpm) require additional installation step that must often be repeated when switching between Node versions. This lead to a significant part of the Node userbase effectively being a second-class citizen, which sounds unfortunate.

- Because one package manager currently holds a special treatment, users are more likely to pick it even if they would choose another solution should they have the choice (it really depends on how they balance the tradeoffs, but sometimes they value simplicity over purely technical factors). This artificial barrier hurts our community by making it harder to pick the right tool for the job.

- Having a single official package manager means that all the keys belong to a single player which can do whatever it pleases with it (even the Node project only has a limited influence over it, since removing the unique package manager would be poorly accepted by the community). Spreading these responsibilities over multiple projects gives less power to each, ensuring that everyone behave well.

Discussion thread: https://github.com/nodejs/node/issues/15244

## How does it work?

When any of the embed binaries are called, the tool will find the closest ancestor `package.json` for the current directory. It will then extract the `engines.pm` key, configured as such:

```json
{
  "engines": {
    "pm": "yarn@^2.0.0"
  }
}
```

The tool will then check whether it got called via the right binary endpoint (`npm` or `npx` when the package manager is configured for npm, `yarn` when configured for Yarn, etc), and will report an error otherwise. This ensures that we can't accidentally call, say, pnpm on an npm project (which would otherwise lead to diverging environments since the lockfiles and features wouldn't be the same depending on the interpreting package managers).

If the check succeeded, the tool will check whether a compatible package manager has been installed (they're all stored on the disk in the local user's home folder). If not, it will install the latest matching release (based on the information dynamically retrieved from [`versions.json`](/versions.json)). Once it has ensured that a version exists, it'll forward the call to it.

> **Why not just ask the user which package manager they want to use when installing Node?**
>
> Whether to use npm or Yarn or pnpm isn't up to the user but to each individual project. Different projects leverage different features from different package managers. For example one project might rely on the Yarn workspaces, whereas another has setup their repository with pnpm in mind.

## Known issues

- The `pnpx` and `npx` binaries can only be called from within pnpm and npm projects, respectively. This is because otherwise we cannot infer the package manager version from the local manifest, as it would list another package manager instead. Fixing that is possible if we include "global installs" features inside pmm (so that we would fallback to the global `npx` in those circumstances). It seemed out of scope for the initial prototype, but we certainly can discuss it in an issue.

## License (MIT)

> **Copyright © 2019 Maël Nison**
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
