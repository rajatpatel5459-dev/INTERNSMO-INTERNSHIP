// services/recommendationEngine.js
// Hybrid recommendation: content-based (acoustic similarity) + collaborative filtering (co-listening)

const Interaction = require('../models/Interaction');
const Track = require('../models/Track');

/**
 * Content-based score: how acoustically similar is a candidate track to the user's taste profile?
 * @param {Object} track - Candidate track
 * @param {Object} tasteProfile - User's acoustic taste profile
 * @returns {number} Similarity score (0 to 1)
 */
function contentBasedScore(track, tasteProfile) {
  if (!track?.acoustic) return 0;
  const { avgBpm, avgEnergy, avgValence } = tasteProfile;

  // Normalize BPM difference (tracks at 60-200 BPM range)
  const bpmDiff = Math.abs(track.acoustic.bpm - avgBpm) / 140; // 140 = half the typical range
  const energyDiff = Math.abs(track.acoustic.energy - avgEnergy);
  const valenceDiff = Math.abs(track.acoustic.valence - avgValence);

  // Average the similarity across all three dimensions
  const similarity = 1 - (bpmDiff + energyDiff + valenceDiff) / 3;
  return Math.max(0, similarity);
}

function rankCandidates(candidateTracks, tasteProfile, collabScores = {}, limit = 5) {
  return candidateTracks
    .map((track) => {
      const contentScore = contentBasedScore(track, tasteProfile);
      const collabScore = (collabScores[track._id.toString()] || 0) / 10;
      return { track, score: contentScore * 0.6 + collabScore * 0.4 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ track }) => track);
}

/**
 * Collaborative filtering: boost tracks that were liked by users who co-listened with this user.
 * @param {string} userId 
 * @param {Array} allTracks 
 * @returns {Object} Map of trackId -> collaborative score
 */
async function collaborativeScore(userId) {
  const scoreMap = {};
  const myInteractions = await Interaction.find({ user: userId })
    .select('coListenedWith lounge');
  const coListenerIds = new Set();
  const loungeIds = new Set();
  myInteractions.forEach((interaction) => {
    (interaction.coListenedWith || []).forEach((id) => coListenerIds.add(id.toString()));
    if (interaction.lounge) loungeIds.add(interaction.lounge.toString());
  });
  if (coListenerIds.size === 0 && loungeIds.size === 0) return scoreMap;

  const criteria = [];
  if (coListenerIds.size) criteria.push({ user: { $in: [...coListenerIds] } });
  if (loungeIds.size) criteria.push({ lounge: { $in: [...loungeIds] }, user: { $ne: userId } });
  const coListenerInteractions = await Interaction.find({
    $and: [
      { $or: criteria },
      { $or: [{ liked: true }, { completed: true }] },
    ],
  }).select('track liked completed');
  coListenerInteractions.forEach((interaction) => {
    const trackId = interaction.track.toString();
    scoreMap[trackId] = (scoreMap[trackId] || 0) + (interaction.liked ? 2 : 1);
  });

  return scoreMap;
}

/**
 * Get personalized track recommendations for a user.
 * @param {string} userId 
 * @param {number} limit - Number of recommendations to return
 * @returns {Array} Recommended tracks
 */
async function getRecommendations(userId, limit = 5) {
    // Build user's acoustic taste profile from their listening history
    const interactions = await Interaction.find({ user: userId })
      .populate('track', 'acoustic title artist')
      .sort({ updatedAt: -1 })
      .limit(50); // Use last 50 interactions

    // Tracks the user has already heard
    const heardTrackIds = interactions.filter((i) => i.track).map((i) => i.track._id.toString());

    // Calculate average acoustic preferences
    let tasteProfile = { avgBpm: 120, avgEnergy: 0.6, avgValence: 0.5 }; // Defaults

    if (interactions.length > 0) {
      const validInteractions = interactions.filter((i) => i.track && i.track.acoustic);
      if (validInteractions.length > 0) {
        tasteProfile = {
          avgBpm:
            validInteractions.reduce((sum, i) => sum + i.track.acoustic.bpm, 0) /
            validInteractions.length,
          avgEnergy:
            validInteractions.reduce((sum, i) => sum + i.track.acoustic.energy, 0) /
            validInteractions.length,
          avgValence:
            validInteractions.reduce((sum, i) => sum + i.track.acoustic.valence, 0) /
            validInteractions.length,
        };
      }
    }

    // Get collaborative scores
    const collabScores = await collaborativeScore(userId);

    // Get all tracks the user hasn't heard yet
    const candidateTracks = await Track.find({
      _id: { $nin: heardTrackIds },
    }).limit(100);

    if (candidateTracks.length === 0) {
      // If user has heard everything, recommend tracks they liked most
      const likedTracks = await Interaction.find({ user: userId, liked: true })
        .populate('track')
        .sort({ updatedAt: -1 })
        .limit(limit);
      return likedTracks.map((i) => i.track).filter(Boolean);
    }

    // Score each candidate track (hybrid: content + collaborative)
    return rankCandidates(candidateTracks, tasteProfile, collabScores, limit);
}

/**
 * Get a user's acoustic taste profile summary.
 * @param {string} userId 
 * @returns {Object} Taste profile
 */
async function getUserTasteProfile(userId) {
  const interactions = await Interaction.find({ user: userId })
    .populate('track', 'acoustic genre')
    .sort({ updatedAt: -1 })
    .limit(100);

  if (interactions.length === 0) {
    return { message: 'No listening history yet. Start listening to get personalized recommendations!' };
  }

  const valid = interactions.filter((i) => i.track && i.track.acoustic);
  if (valid.length === 0) {
    return { message: 'Listening history has no tracks with acoustic profiles yet.' };
  }

  const avgBpm = valid.reduce((s, i) => s + i.track.acoustic.bpm, 0) / valid.length;
  const avgEnergy = valid.reduce((s, i) => s + i.track.acoustic.energy, 0) / valid.length;
  const avgValence = valid.reduce((s, i) => s + i.track.acoustic.valence, 0) / valid.length;

  return {
    totalTracksListened: interactions.length,
    avgBpm: Math.round(avgBpm),
    avgEnergy: parseFloat(avgEnergy.toFixed(2)),
    avgValence: parseFloat(avgValence.toFixed(2)),
    energyLabel: avgEnergy > 0.6 ? 'High Energy' : avgEnergy > 0.3 ? 'Mid Energy' : 'Chill',
    moodLabel: avgValence > 0.6 ? 'Positive/Happy' : avgValence > 0.3 ? 'Neutral' : 'Dark/Melancholic',
  };
}

module.exports = {
  contentBasedScore,
  rankCandidates,
  getRecommendations,
  getUserTasteProfile,
};
