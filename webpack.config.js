const path = require('path');

module.exports = {
  entry: './public/script.js', // Your main JavaScript file
  output: {
    filename: 'bundle.js', // Output filename
    path: path.resolve(__dirname, 'public/dist') // Output directory
  },
  mode: 'development', // or 'production'
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  }
};

