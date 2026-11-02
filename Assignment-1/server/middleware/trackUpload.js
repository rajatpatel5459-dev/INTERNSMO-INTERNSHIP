const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const trackUploadDirectory = path.resolve(__dirname, '..', 'uploads', 'tracks');
fs.mkdirSync(trackUploadDirectory, { recursive: true });

const extensionsByMimeType = {
  'audio/aac': '.aac',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.webm',
  'audio/x-m4a': '.m4a',
  'audio/x-wav': '.wav',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const allowedMimeTypesByField = {
  audio: new Set([
    'audio/aac',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'audio/x-m4a',
    'audio/x-wav',
  ]),
  cover: new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']),
};

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, trackUploadDirectory),
  filename: (_req, file, callback) => {
    callback(null, `${uuidv4()}${extensionsByMimeType[file.mimetype]}`);
  },
});

const uploadTrackAssets = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 2,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypesByField[file.fieldname]?.has(file.mimetype)) {
      const error = new Error(file.fieldname === 'cover'
        ? 'Cover image must be a JPEG, PNG, GIF, or WebP file.'
        : 'Audio must be an AAC, M4A, MP3, OGG, WAV, or WebM file.');
      error.statusCode = 400;
      callback(error);
      return;
    }
    callback(null, true);
  },
}).fields([
  { name: 'audio', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
]);

module.exports = { trackUploadDirectory, uploadTrackAssets };
