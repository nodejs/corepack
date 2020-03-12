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
                use: `ts-loader`,
            }
        ]
    },
    stats: {
        assetsSort: '!size'
    }
};
