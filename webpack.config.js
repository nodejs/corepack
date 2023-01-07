const webpack = require(`webpack`);

module.exports = {
  mode: `production`,
  devtool: false,
  target: `node`,
  entry: {
    [`corepack`]: `./sources/_entryPoint.ts`,
  },
  output: {
    libraryTarget: `commonjs`,
    chunkFilename: `chunks/[name].cjs`,
  },
  resolve: {
    extensions: [`.ts`, `.js`],
  },
  module: {
    noParse: /v8-compile-cache/,
    rules: [
      {
        test: /\.ts$/,
        loader: `ts-loader`,
        options: {
          compilerOptions: {
            module: `ES2020`,
            noEmit: false,
          },
        },
      },
    ],
  },
  stats: {
    assetsSort: `!size`,
  },
  optimization: {
    minimize: false,
  },
  plugins: [
    new webpack.BannerPlugin({
      entryOnly: true,
      banner: `#!/usr/bin/env node\n/* eslint-disable */`,
      raw: true,
    }),
  ],
};
