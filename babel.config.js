module.exports = {
  presets: [
    `@babel/preset-typescript`,
  ],
  plugins: [
    [`@babel/plugin-transform-modules-commonjs`],
    [`babel-plugin-dynamic-import-node`],
  ],
};
