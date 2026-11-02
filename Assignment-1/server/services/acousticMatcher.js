// services/acousticMatcher.js
// Checks if two tracks are harmonically compatible based on BPM and Camelot key rules.
// These are HARD CONSTRAINTS - the AI DJ can only pick tracks that pass these checks.

// The Camelot Wheel defines which keys mix well together.
// Adjacent numbers and same-number different letters are compatible.
// Example: 8A is compatible with 7A, 9A, and 8B
const CAMELOT_COMPATIBLE = {
  '1A':  ['1A', '12A', '2A', '1B'],
  '2A':  ['2A', '1A', '3A', '2B'],
  '3A':  ['3A', '2A', '4A', '3B'],
  '4A':  ['4A', '3A', '5A', '4B'],
  '5A':  ['5A', '4A', '6A', '5B'],
  '6A':  ['6A', '5A', '7A', '6B'],
  '7A':  ['7A', '6A', '8A', '7B'],
  '8A':  ['8A', '7A', '9A', '8B'],
  '9A':  ['9A', '8A', '10A', '9B'],
  '10A': ['10A', '9A', '11A', '10B'],
  '11A': ['11A', '10A', '12A', '11B'],
  '12A': ['12A', '11A', '1A', '12B'],
  '1B':  ['1B', '12B', '2B', '1A'],
  '2B':  ['2B', '1B', '3B', '2A'],
  '3B':  ['3B', '2B', '4B', '3A'],
  '4B':  ['4B', '3B', '5B', '4A'],
  '5B':  ['5B', '4B', '6B', '5A'],
  '6B':  ['6B', '5B', '7B', '6A'],
  '7B':  ['7B', '6B', '8B', '7A'],
  '8B':  ['8B', '7B', '9B', '8A'],
  '9B':  ['9B', '8B', '10B', '9A'],
  '10B': ['10B', '9B', '11B', '10A'],
  '11B': ['11B', '10B', '12B', '11A'],
  '12B': ['12B', '11B', '1B', '12A'],
};

/**
 * Check if two tracks are compatible for harmonic mixing.
 * @param {Object} currentTrack - The track currently playing (has .acoustic.bpm and .acoustic.camelotKey)
 * @param {Object} candidateTrack - The candidate next track
 * @param {Number} bpmTolerancePct - How many percent BPM difference is allowed (default 8%)
 * @returns {Object} { compatible: boolean, reason: string }
 */
function checkCompatibility(currentTrack, candidateTrack, bpmTolerancePct = 8) {
  const currentBpm = Number(currentTrack?.acoustic?.bpm);
  const candidateBpm = Number(candidateTrack?.acoustic?.bpm);
  const currentKey = currentTrack?.acoustic?.camelotKey;
  const candidateKey = candidateTrack?.acoustic?.camelotKey;

  if (!Number.isFinite(currentBpm) || currentBpm <= 0 ||
      !Number.isFinite(candidateBpm) || candidateBpm <= 0) {
    return { compatible: false, reason: 'Both tracks must have a positive BPM.' };
  }

  const bpmRatios = [0.5, 1, 2];
  const bpmDiffPct = Math.min(...bpmRatios.map((ratio) => (
    Math.abs(candidateBpm - currentBpm * ratio) / (currentBpm * ratio) * 100
  )));

  if (bpmDiffPct > bpmTolerancePct) {
    return {
      compatible: false,
      reason: `BPM mismatch: ${currentBpm} vs ${candidateBpm} (${bpmDiffPct.toFixed(1)}% difference, limit is ${bpmTolerancePct}%)`,
      bpmDiffPct,
    };
  }

  const compatibleKeys = CAMELOT_COMPATIBLE[currentKey] || [];
  if (!compatibleKeys.includes(candidateKey)) {
    return {
      compatible: false,
      reason: `Key clash: ${currentKey} is not compatible with ${candidateKey}`,
      bpmDiffPct,
    };
  }

  return {
    compatible: true,
    reason: `Compatible: BPM difference ${bpmDiffPct.toFixed(1)}%, keys ${currentKey} to ${candidateKey}`,
    bpmDiffPct,
  };
}

/**
 * From a list of candidate tracks, filter only the ones compatible with the current track.
 * @param {Object} currentTrack 
 * @param {Array} candidates - Array of track documents
 * @param {Number} bpmTolerancePct 
 * @returns {Array} Array of compatible tracks
 */
function filterCompatibleTracks(currentTrack, candidates, bpmTolerancePct = 8) {
  return candidates.filter((candidate) => {
    const result = checkCompatibility(currentTrack, candidate, bpmTolerancePct);
    return result.compatible;
  });
}

/**
 * Pick the best next track from candidates.
 * Prefers tracks with closer BPM and adjacent Camelot keys.
 * @param {Object} currentTrack 
 * @param {Array} candidates 
 * @param {Number} sentimentScore - Current room sentiment (-1 to +1)
 * @param {Number} bpmTolerancePct 
 * @returns {Object|null} Best matching track or null if no compatible tracks
 */
function harmonicCloseness(currentKey, candidateKey) {
  if (currentKey === candidateKey) return 1;
  const compatibleKeys = CAMELOT_COMPATIBLE[currentKey] || [];
  if (!compatibleKeys.includes(candidateKey)) return 0;
  return currentKey[1] === candidateKey[1] ? 0.85 : 0.9;
}

function pickBestSegue(
  currentTrack,
  candidates,
  sentimentScore = 0,
  bpmTolerancePct = 8,
  recentlyPlayedIds = [],
  recentTrackLimit = 10
) {
  const compatible = filterCompatibleTracks(currentTrack, candidates, bpmTolerancePct);

  if (compatible.length === 0) {
    return null;
  }

  const recentIds = new Set(recentlyPlayedIds.slice(0, recentTrackLimit).map(String));
  const targetEnergy = Math.max(0, Math.min(1, 0.5 + sentimentScore * 0.3));

  const scored = compatible.map((track) => {
    const trackId = String(track._id || track.id || '');
    const energy = Number(track.acoustic?.energy);
    const energyScore = Number.isFinite(energy)
      ? Math.max(0, 1 - Math.abs(energy - targetEnergy))
      : 0.5;
    const recencyScore = recentIds.has(trackId) ? 0 : 1;
    const score =
      harmonicCloseness(currentTrack.acoustic.camelotKey, track.acoustic.camelotKey) * 0.5 +
      energyScore * 0.3 +
      recencyScore * 0.2;

    return { track, score };
  });

  scored.sort((a, b) => b.score - a.score || String(a.track._id || a.track.id).localeCompare(String(b.track._id || b.track.id)));
  return scored[0].track;
}

module.exports = {
  checkCompatibility,
  filterCompatibleTracks,
  harmonicCloseness,
  pickBestSegue,
};
