const TerserPlugin = require('terser-webpack-plugin');
const webpack = require(`webpack`);

module.exports = {
    mode: `production`,
    devtool: false,
    target: `node`,
    entry: {
        [`pmm`]: `./sources/main.ts`,
    },
    output: {
        libraryTarget: `commonjs`,
    },
    resolve: {
        extensions: [`.ts`, `.js`],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: `ts-loader`,
                options: {
                    compilerOptions: {
                        module: `es6`,
                    },
                },
            }
        ]
    },
    stats: {
        assetsSort: '!size'
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
