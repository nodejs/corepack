# Contributing to Corepack

If you want to build Corepack yourself, you can build the project like this:

1. Clone this repository.
2. Run `yarn install` (or `corepack yarn install` if the global version of
   `yarn` is not provided by Corepack).
3. Run `yarn build` (or `corepack yarn build`).

The `dist/` directory now contains the corepack build and the shims.
Call `node ./dist/corepack --help` and behold.
You can also run the tests with `yarn test`.

# Adding a new package manager

New package managers can be added by editing the following files:

- [`config.json`](./config.json),
- [`.github/workflows/sync.yml`](./.github/workflows/sync.yml) that keeps pinned
  versions up-to-date,
- [`package.json`](./package.json) to add to add the added shims to the list of
  `"publishConfig/bin"` and `"executableFiles"`,
- [`sources/types.ts`](./sources/types.ts) to add the package manager to the
  `SupportedPackageManagers` enum,
- [`tests/main.test.ts`](./tests/main.test.ts) tests to ensure the added package
  manager works as expected.

Once added, the shims pertaining to new package managers won't be automatically
enabled by `corepack enable` when called without arguments - it'll require users
to explicitly install the relevant shims (e.g. `corepack enable mypm`). A
separate PR adding the package manager to the default list can be opened a
couple of months after the new package manager was introduced.

Finally, this repository does not manage which package managers are distributed
with default install of Node.js. This is managed in the
[nodejs/node](https://github.com/nodejs/node) repository, refer to the
[CONTRIBUTING.md](https://github.com/nodejs/node/blob/main/CONTRIBUTING.md) over
there for more information.

## Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

* (a) The contribution was created in whole or in part by me and I
  have the right to submit it under the open source license
  indicated in the file; or

* (b) The contribution is based upon previous work that, to the best
  of my knowledge, is covered under an appropriate open source
  license and I have the right under that license to submit that
  work with modifications, whether created in whole or in part
  by me, under the same open source license (unless I am
  permitted to submit under a different license), as indicated
  in the file; or

* (c) The contribution was provided directly to me by some other
  person who certified (a), (b) or (c) and I have not modified
  it.

* (d) I understand and agree that this project and the contribution
  are public and that a record of the contribution (including all
  personal information I submit with it, including my sign-off) is
  maintained indefinitely and may be redistributed consistent with
  this project or the open source license(s) involved.

## Moderation Policy

The [Node.js Moderation Policy] applies to this project.

[Node.js Moderation Policy]:
https://github.com/nodejs/admin/blob/master/Moderation-Policy.md
