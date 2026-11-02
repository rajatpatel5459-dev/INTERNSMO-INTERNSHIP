const fs = require('fs');
const path = require('path');
const { trackUploadDirectory } = require('../middleware/trackUpload');

async function removeUploadedFiles(files) {
  const uploadedFiles = Object.values(files || {}).flat();
  await Promise.all(uploadedFiles.map(async (file) => {
    try {
      await fs.promises.unlink(file.path);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Could not remove an unclaimed track upload:', error.message);
      }
    }
  }));
}

async function removeTrackAssetUrls(assetUrls) {
  const prefix = '/uploads/tracks/';
  await Promise.all(assetUrls.filter((url) => typeof url === 'string' && url.startsWith(prefix)).map(async (url) => {
    const filename = url.slice(prefix.length);
    if (!filename || path.basename(filename) !== filename) return;

    try {
      await fs.promises.unlink(path.join(trackUploadDirectory, filename));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }));
}

module.exports = { removeUploadedFiles, removeTrackAssetUrls };
