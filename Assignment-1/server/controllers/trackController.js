// controllers/trackController.js - Track CRUD + acoustic feature upload

const Track = require('../models/Track');
const { validateTrackTimeline } = require('../services/trackValidation');
const { removeUploadedFiles, removeTrackAssetUrls } = require('../services/trackAssetStorage');

function getTrackPayload(body) {
  if (!body.trackData) return body;
  try {
    return JSON.parse(body.trackData);
  } catch {
    const error = new Error('Track details could not be read.');
    error.statusCode = 400;
    throw error;
  }
}

async function rejectTrackRequest(req, res, statusCode, message) {
  await removeUploadedFiles(req.files);
  return res.status(statusCode).json({ success: false, message });
}

// @route   GET /api/tracks
// @desc    Get all tracks (with optional search/filter)
// @access  Private
const getAllTracks = async (req, res, next) => {
  try {
    const { search, genre, minBpm, maxBpm } = req.query;

    // Build filter object
    const filter = {};

    if (search) {
      // Search by title or artist (case-insensitive)
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { artist: { $regex: search, $options: 'i' } },
      ];
    }

    if (genre) filter.genre = { $regex: genre, $options: 'i' };
    if (minBpm) filter['acoustic.bpm'] = { $gte: Number(minBpm) };
    if (maxBpm) {
      filter['acoustic.bpm'] = { ...filter['acoustic.bpm'], $lte: Number(maxBpm) };
    }

    const tracks = await Track.find(filter).populate('uploadedBy', 'displayName');

    res.status(200).json({
      success: true,
      count: tracks.length,
      tracks,
    });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/tracks/:id
// @desc    Get a single track by ID
// @access  Private
const getTrackById = async (req, res, next) => {
  try {
    const track = await Track.findById(req.params.id).populate('uploadedBy', 'displayName');

    if (!track) {
      return res.status(404).json({ success: false, message: 'Track not found.' });
    }

    res.status(200).json({ success: true, track });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/tracks
// @desc    Upload a new track with acoustic features
// @access  Private (host or admin)
const createTrack = async (req, res, next) => {
  try {
    const { title, artist, album, genre, durationSeconds, acoustic, timeline } = getTrackPayload(req.body);
    const audioAssetUrl = req.files?.audio?.[0]
      ? `/uploads/tracks/${req.files.audio[0].filename}`
      : '';
    const coverImageUrl = req.files?.cover?.[0]
      ? `/uploads/tracks/${req.files.cover[0].filename}`
      : '';

    // Validate required fields
    if (!title || !artist || !durationSeconds || !acoustic) {
      return rejectTrackRequest(req, res, 400, 'Please provide title, artist, duration, and acoustic features (bpm, camelotKey, energy, valence).');
    }

    if (!req.files?.audio?.[0]) {
      return rejectTrackRequest(req, res, 400, 'Upload an audio file before adding the track.');
    }

    // Validate acoustic features
    const { bpm, camelotKey, energy, valence } = acoustic;

    if (!bpm || bpm <= 0) {
      return rejectTrackRequest(req, res, 400, 'BPM must be a positive number.');
    }

    if (energy < 0 || energy > 1 || valence < 0 || valence > 1) {
      return rejectTrackRequest(req, res, 400, 'Energy and valence must be between 0.0 and 1.0.');
    }

    const trackTimeline = timeline === undefined ? [] : timeline;
    const timelineError = validateTrackTimeline(trackTimeline, Number(durationSeconds));
    if (timelineError) {
      return rejectTrackRequest(req, res, 400, timelineError);
    }

    const track = await Track.create({
      title,
      artist,
      album,
      genre,
      durationSeconds,
      audioAssetUrl,
      coverImageUrl,
      acoustic: { bpm, camelotKey, energy, valence },
      timeline: trackTimeline.map((entry) => ({ ...entry, text: entry.text.trim() })),
      uploadedBy: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: 'Track uploaded successfully!',
      track,
    });
  } catch (error) {
    await removeUploadedFiles(req.files);
    next(error);
  }
};

// @route   PUT /api/tracks/:id
// @desc    Update a track's details or acoustic features
// @access  Private (admin or the uploader)
const updateTrack = async (req, res, next) => {
  try {
    const payload = getTrackPayload(req.body);
    let track = await Track.findById(req.params.id);

    if (!track) {
      return rejectTrackRequest(req, res, 404, 'Track not found.');
    }

    // Only admin or the user who uploaded it can update
    const isOwner = track.uploadedBy && track.uploadedBy.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return rejectTrackRequest(req, res, 403, 'You are not allowed to update this track.');
    }

    const previousAudioAssetUrl = track.audioAssetUrl;
    const previousCoverImageUrl = track.coverImageUrl;
    const updateData = { ...payload };
    if (req.files?.audio?.[0]) {
      updateData.audioAssetUrl = `/uploads/tracks/${req.files.audio[0].filename}`;
    }
    if (req.files?.cover?.[0]) {
      updateData.coverImageUrl = `/uploads/tracks/${req.files.cover[0].filename}`;
    }
    if (updateData.timeline !== undefined || updateData.durationSeconds !== undefined) {
      const durationSeconds = updateData.durationSeconds === undefined
        ? track.durationSeconds
        : Number(updateData.durationSeconds);
      const timeline = updateData.timeline === undefined ? track.timeline : updateData.timeline;
      const timelineError = validateTrackTimeline(timeline, durationSeconds);
      if (timelineError) {
        return rejectTrackRequest(req, res, 400, timelineError);
      }
      if (updateData.timeline !== undefined) {
        updateData.timeline = timeline.map((entry) => ({ ...entry, text: entry.text.trim() }));
      }
    }

    track = await Track.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    const replacedAssets = [];
    if (req.files?.audio?.[0]) replacedAssets.push(previousAudioAssetUrl);
    if (req.files?.cover?.[0]) replacedAssets.push(previousCoverImageUrl);
    try {
      await removeTrackAssetUrls(replacedAssets);
    } catch (cleanupError) {
      console.error('Could not remove a replaced track asset:', cleanupError.message);
    }

    res.status(200).json({ success: true, message: 'Track updated!', track });
  } catch (error) {
    await removeUploadedFiles(req.files);
    next(error);
  }
};

// @route   DELETE /api/tracks/:id
// @desc    Delete a track
// @access  Private (admin only)
const deleteTrack = async (req, res, next) => {
  try {
    const track = await Track.findById(req.params.id);

    if (!track) {
      return res.status(404).json({ success: false, message: 'Track not found.' });
    }

    const assetUrls = [track.audioAssetUrl, track.coverImageUrl];
    await track.deleteOne();
    await removeTrackAssetUrls(assetUrls);

    res.status(200).json({ success: true, message: 'Track deleted.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAllTracks, getTrackById, createTrack, updateTrack, deleteTrack };
