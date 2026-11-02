// controllers/recommendationController.js - Personalized track recommendations

const { getRecommendations, getUserTasteProfile } = require('../services/recommendationEngine');
const Interaction = require('../models/Interaction');

// @route   GET /api/recommendations
// @desc    Get personalized track recommendations for the current user
// @access  Private
const getMyRecommendations = async (req, res, next) => {
  try {
    const { limit = 5 } = req.query;
    const parsedLimit = Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 20) {
      return res.status(400).json({ success: false, message: 'limit must be an integer between 1 and 20.' });
    }
    const recommendations = await getRecommendations(req.user.id, parsedLimit);

    res.status(200).json({
      success: true,
      count: recommendations.length,
      recommendations,
    });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/recommendations/taste-profile
// @desc    Get the user's acoustic taste profile
// @access  Private
const getMyTasteProfile = async (req, res, next) => {
  try {
    const profile = await getUserTasteProfile(req.user.id);

    res.status(200).json({
      success: true,
      tasteProfile: profile,
    });
  } catch (error) {
    next(error);
  }
};

const getMyInteractions = async (req, res, next) => {
  try {
    const interactions = await Interaction.find({ user: req.user.id })
      .populate('track', 'title artist album genre durationSeconds coverImageUrl acoustic timeline')
      .sort({ updatedAt: -1 })
      .limit(100);

    res.status(200).json({
      success: true,
      savedTrackIds: interactions
        .filter((interaction) => interaction.liked && interaction.track)
        .map((interaction) => interaction.track._id),
      recentTracks: interactions
        .filter((interaction) => interaction.track)
        .map((interaction) => interaction.track),
    });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/recommendations/interaction
// @desc    Record a listening interaction (track played, liked, etc.)
// @access  Private
const recordInteraction = async (req, res, next) => {
  try {
    const { trackId, playedSeconds, completed, liked, loungeId, coListenedWith } = req.body;

    if (!trackId) {
      return res.status(400).json({ success: false, message: 'trackId is required.' });
    }

    const setValues = {};
    if (playedSeconds !== undefined) {
      if (!Number.isFinite(Number(playedSeconds)) || Number(playedSeconds) < 0) {
        return res.status(400).json({ success: false, message: 'playedSeconds must be a non-negative number.' });
      }
      setValues.playedSeconds = Number(playedSeconds);
    }
    if (completed !== undefined) {
      if (typeof completed !== 'boolean') return res.status(400).json({ success: false, message: 'completed must be a boolean.' });
      setValues.completed = completed;
    }
    if (liked !== undefined) {
      if (typeof liked !== 'boolean') return res.status(400).json({ success: false, message: 'liked must be a boolean.' });
      setValues.liked = liked;
    }
    if (loungeId !== undefined) setValues.lounge = loungeId || null;

    const interaction = await Interaction.findOneAndUpdate(
      { user: req.user.id, track: trackId },
      {
        $set: setValues,
        $addToSet: { coListenedWith: { $each: coListenedWith || [] } },
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Interaction recorded!',
      interaction,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getMyRecommendations, getMyTasteProfile, getMyInteractions, recordInteraction };
