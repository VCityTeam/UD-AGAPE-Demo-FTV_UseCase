const path = require('path');
const mode = process.env.NODE_ENV;
const debugBuild = mode === 'development';

let outputPath;
if (debugBuild) {
    outputPath = path.resolve(__dirname, 'dist/debug');
} else {
    outputPath = path.resolve(__dirname, 'dist/production');
}

module.exports = (env) => {
    const rules = [
        {
            // We also want to (web)pack the style files:
            test: /\.css$/,
            use: ['style-loader', 'css-loader'],
        },
        {
            test: /\.json$/,
            include: [path.resolve(__dirname, 'src')],
            loader: 'raw-loader',
        },
        {
            test: /\.html$/,
            use: [
                {
                    loader: 'html-loader',
                    options: { minimize: !debugBuild },
                },
            ],
        },
    ];

    const config = {
        mode,
        entry: [path.resolve(__dirname, './src/index.js')],
        output: {
            path: outputPath,
            filename: 'app.js',
            library: 'app',
            libraryTarget: 'umd',
            umdNamedDefine: true,
        },
        module: {
            rules: rules,
        },
        devServer: {
            port: 8080,
            hot: true,
            static: {
                directory: path.resolve(__dirname, './'),
                watch: true,
            },
            devMiddleware: {
                publicPath: '/dist/debug/',
            },
        }
    };

    if (debugBuild) config.devtool = 'source-map';

    return config;
};