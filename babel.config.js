module.exports = {
  presets: [
    `@babel/preset-typescript`,
  ],
  plugins: [
    [`@babel/plugin-proposal-decorators`, {legacy: true}],
    [`@babel/plugin-proposal-class-properties`, {loose: true}],
    [`@babel/plugin-transform-modules-commonjs`],
    [`@babel/plugin-proposal-nullish-coalescing-operator`],
  ],
};
