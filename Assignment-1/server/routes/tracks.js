// routes/tracks.js
const express = require('express');
const router = express.Router();
const { getAllTracks, getTrackById, createTrack, updateTrack, deleteTrack } = require('../controllers/trackController');
const { protect, authorize } = require('../middleware/auth');
const { uploadTrackAssets } = require('../middleware/trackUpload');

router.get('/', protect, getAllTracks);
router.get('/:id', protect, getTrackById);
router.post('/', protect, authorize('admin'), uploadTrackAssets, createTrack);
router.put('/:id', protect, uploadTrackAssets, updateTrack);
router.delete('/:id', protect, authorize('admin'), deleteTrack); // Admin only

module.exports = router;
