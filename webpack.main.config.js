const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');

module.exports = {
  entry: './src/main/main.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
  },
  externals: {
    'ffmpeg-static': 'commonjs ffmpeg-static',
    'ffprobe-static': 'commonjs ffprobe-static'
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/selection.html',
          to: 'selection.html'
        },
        {
          from: path.resolve(__dirname, 'node_modules/ffmpeg-static/ffmpeg'),
          to: 'bin/[name][ext]'
        },
        {
          from: path.resolve(__dirname, 'node_modules/ffprobe-static/bin'),
          to: 'bin'
        }
      ]
    })
  ]
}; 