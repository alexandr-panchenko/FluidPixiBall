const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const isDev = process.env.NODE_ENV !== 'production';

module.exports = env => {
    const htmlTemplate = "./src/index.html";
    const plugins = env && env.clean
        ? [new CleanWebpackPlugin(), new HtmlWebpackPlugin({ template: htmlTemplate })]
        : [new HtmlWebpackPlugin({ template: htmlTemplate })];

    const mode = env && env.prod
        ? "production"
        : "development";

    return {
        devtool: "inline-source-map",
        entry: {
            app: "./src/scripts/app.ts",
        },
        mode,
        module: {
            rules: [{
                test: /\.tsx?$/,
                loader: "ts-loader"
            }]
        },
        output: {
            filename: "[name].[contenthash].js",
        },
        plugins: [
	        new CleanWebpackPlugin(),
		new HtmlWebpackPlugin({ template: "./src/index.html" }),
	        new CopyPlugin([
	            { from: 'src/css/style.css', to: 'css/' },
	            { from: 'src/images/soccer50.png', to: 'images/' },
	            { from: 'src/images/soccer80.png', to: 'images/' },
        	]),
	],
        resolve: {
            extensions: [".ts", ".js"],
        },
        
    };
};
