module.exports = {
  extends: [
    `@yarnpkg`,
  ],
  rules: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'no-restricted-globals': [`error`, {
      name: `fetch`,
      message: `Use fetch from sources/fetchUtils.ts`,
    }],
  },
};
