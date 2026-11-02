// services/aiDjEngine.js
// Generates AI DJ responses from persisted track metadata and acoustic features.

const { getSentimentLabel } = require('./sentimentEngine');

/**
 * Generate a transition script (banter) between two tracks.
 * @param {Object} currentTrack - The track that was just playing
 * @param {Object} nextTrack - The track about to play
 * @param {number} sentimentScore - Current room sentiment
 * @returns {string} Transition banter text
 */
async function generateTransitionBanter(currentTrack, nextTrack, sentimentScore = 0) {
  const source = (nextTrack.timeline || [])[0] || (currentTrack.timeline || [])[0];
  const groundedNote = source
    ? ` The track notes add: "${source.text}"`
    : '';
  return `That was "${currentTrack.title}" by ${currentTrack.artist}. The room is feeling ${getSentimentLabel(sentimentScore).toLowerCase()}, so "${nextTrack.title}" by ${nextTrack.artist} is next: ${nextTrack.acoustic.bpm} BPM in ${nextTrack.acoustic.camelotKey}.${groundedNote}`;
}

/**
 * Answer a user's question about the currently playing track.
 * Grounded in the track's timeline metadata (RAG-style).
 * @param {string} question - The user's question
 * @param {Object} track - The current track document (with .timeline metadata)
 * @returns {Object} { answer: string, sources: Array }
 */
async function answerTrackQuestion(question, track) {
  if (!track) {
    return {
      answer: "I'm not sure — there's no track playing right now!",
      sources: [],
    };
  }

  const lowerQ = question.toLowerCase();
  const timeline = track.timeline || [];
  const ignoredWords = new Set([
    'about', 'after', 'artist', 'can', 'could', 'did', 'does', 'from', 'have',
    'help', 'into', 'is', 'it', 'know', 'me', 'of', 'on', 'please', 'tell',
    'that', 'the', 'this', 'to', 'track', 'what', 'where', 'which', 'who',
  ]);
  const questionWords = new Set(
    lowerQ.match(/[a-z0-9]+/g)?.filter((word) => word.length > 2 && !ignoredWords.has(word)) || []
  );

  // Find relevant metadata entries from the track's timeline
  const relevantSources = timeline.filter((entry) => {
    const entryWords = new Set(entry.text.toLowerCase().match(/[a-z0-9]+/g) || []);
    return [...questionWords].some((word) => entryWords.has(word));
  });

  // Build answer from found metadata
  if (relevantSources.length > 0) {
    const sourceTexts = relevantSources.map((s) => s.text).join(' ');
    const answer = `Based on what I know about "${track.title}": ${sourceTexts}`;
    return {
      answer,
      sources: relevantSources.map((s) => ({ ts: s.ts, type: s.type, text: s.text })),
    };
  }

  // If no metadata matches, give a generic response with track info
  if (/\b(bpm|tempo)\b/.test(lowerQ)) {
    return {
      answer: `"${track.title}" runs at ${track.acoustic.bpm} BPM in the ${track.acoustic.camelotKey} key.`,
      sources: [],
    };
  }

  if (/\b(energy|vibe)\b/.test(lowerQ)) {
    const energyLevel = track.acoustic.energy > 0.7 ? 'high energy' : track.acoustic.energy > 0.4 ? 'mid energy' : 'chill';
    return {
      answer: `"${track.title}" is a ${energyLevel} track with an energy score of ${track.acoustic.energy.toFixed(2)}.`,
      sources: [],
    };
  }

  // Graceful fallback - don't make up facts
  return {
    answer: `I don't have specific details about that for "${track.title}" by ${track.artist}. I only speak from what's in my track notes — I won't guess!`,
    sources: [],
  };
}

/**
 * Generate a Soundclash resolution announcement.
 * @param {Object} winningTrack - The track that won the battle
 * @param {number} winnerVotes - How many votes the winner got
 * @param {number} totalVotes - Total votes cast
 * @returns {string} Announcement text
 */
function generateSoundclashAnnouncement(winningTrack, winnerVotes, totalVotes) {
  const percentage = totalVotes > 0 ? Math.round((winnerVotes / totalVotes) * 100) : 0;
  return `🏆 SOUNDCLASH RESULT: The crowd has spoken! "${winningTrack.title}" by ${winningTrack.artist} wins with ${winnerVotes} votes (${percentage}% of the room). It's going straight into the queue. Let's hear it! 🔥`;
}

module.exports = {
  generateTransitionBanter,
  answerTrackQuestion,
  generateSoundclashAnnouncement,
};
