const TerserPlugin = require(`terser-webpack-plugin`);
const webpack = require(`webpack`);

module.exports = {
  mode: `development`,
  devtool: false,
  target: `node`,
  entry: {
    [`corepack`]: `./sources/main.ts`,
    [`vcc`]: `v8-compile-cache`,
  },
  output: {
    libraryTarget: `commonjs`,
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
            module: `es2020`,
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
    minimizer: [
      new TerserPlugin({
        extractComments: false,
      }),
    ],
  },
  plugins: [
    new webpack.BannerPlugin({
      entryOnly: true,
      banner: `#!/usr/bin/env node\n/* eslint-disable */`,
      raw: true,
    }),
  ],
};
