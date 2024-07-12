import yarnpkg from '@yarnpkg/eslint-config';

// eslint-disable-next-line arca/no-default-export
export default [
  {
    ignores: [
      `.yarn`,
      `dist`,
      `shims`,
      `.pnp.*`,
    ],
  },
  ...yarnpkg,
  {
    rules: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'no-restricted-globals': [`error`, {
        name: `fetch`,
        message: `Use fetch from sources/httpUtils.ts`,
      }],
    },
  },
];
