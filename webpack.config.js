const webpack = require('webpack');

module.exports = {
    entry: './src/index.js',
    module: {
        loaders: [
            { test: /\.js$/, loader: "babel-loader" }
        ]
    },
    output: {
        filename: 'index.js',
        path: './bin'
    },
    plugins: [
        new webpack.BannerPlugin({banner: '#!/usr/bin/env node', raw: true})
    ],
    target: 'node'
};