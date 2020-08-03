const webpack = require(`webpack`);

module.exports = {
    mode: `production`,
    devtool: false,
    target: `node`,
    entry: {
        [`main`]: `./sources/main.ts`,
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
    plugins: [
        new webpack.BannerPlugin({
            entryOnly: true,
            banner: `#!/usr/bin/env node\n/* eslint-disable */`,
            raw: true,
        }),
    ],
};
