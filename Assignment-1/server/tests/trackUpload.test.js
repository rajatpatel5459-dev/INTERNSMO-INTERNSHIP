const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const test = require('node:test');
const { trackUploadDirectory, uploadTrackAssets } = require('../middleware/trackUpload');

test('track asset uploads are stored and served, while unsupported media is rejected', async () => {
  const app = express();
  app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads')));
  app.post('/tracks', uploadTrackAssets, (req, res) => {
    res.json({
      audio: `/uploads/tracks/${req.files.audio[0].filename}`,
      cover: `/uploads/tracks/${req.files.cover[0].filename}`,
    });
  });
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 400).json({ message: error.message });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const savedPaths = [];

  try {
    const form = new FormData();
    form.append('audio', new Blob(['audio bytes'], { type: 'audio/mpeg' }), 'track.mp3');
    form.append('cover', new Blob(['image bytes'], { type: 'image/png' }), 'cover.png');

    const uploadResponse = await fetch(`${baseUrl}/tracks`, { method: 'POST', body: form });
    assert.equal(uploadResponse.status, 200);
    const assets = await uploadResponse.json();

    for (const [assetUrl, expectedContent] of [[assets.audio, 'audio bytes'], [assets.cover, 'image bytes']]) {
      const filename = path.basename(assetUrl);
      savedPaths.push(path.join(trackUploadDirectory, filename));
      const assetResponse = await fetch(`${baseUrl}${assetUrl}`);
      assert.equal(assetResponse.status, 200);
      assert.equal(await assetResponse.text(), expectedContent);
    }

    const invalidForm = new FormData();
    invalidForm.append('audio', new Blob(['not audio'], { type: 'text/plain' }), 'track.txt');
    const invalidResponse = await fetch(`${baseUrl}/tracks`, { method: 'POST', body: invalidForm });
    assert.equal(invalidResponse.status, 400);
    assert.match((await invalidResponse.json()).message, /Audio must be/);
  } finally {
    await Promise.all(savedPaths.map((filePath) => fs.unlink(filePath)));
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
