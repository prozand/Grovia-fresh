const fs = require('fs/promises');
const originalReadFile = fs.readFile;
fs.readFile = async function(path, options) {
  try {
    return await originalReadFile.apply(this, arguments);
  } catch (err) {
    if (err.code === 'EISDIR') {
      console.error('EISDIR reading path:', path);
    }
    throw err;
  }
};
require('@netlify/zip-it-and-ship-it').zipFunctions('netlify/functions', 'out').catch(err => console.error(err.message));
