// services/sentimentEngine.js
// Analyzes text messages and returns a sentiment score.
// Score range: -1 (very negative) to +1 (very positive)
// This is a simple keyword-based approach - easy to understand and extend.

// Positive words/phrases that increase the sentiment score
const POSITIVE_KEYWORDS = [
  'fire', 'banger', 'lit', 'love', 'amazing', 'great', 'awesome', 'yes',
  'hype', 'vibe', 'vibes', 'energy', 'lets go', "let's go", 'nice', 'sick',
  'goat', 'legendary', 'perfect', 'perfect', 'beautiful', 'wow', 'incredible',
  'peak', 'go off', 'this slaps', 'slaps', '🔥', '❤️', '🎵', '🎶', '💯', '⚡',
  'good', 'excellent', 'fantastic', 'best', 'brilliant', 'class', 'top',
];

// Negative words/phrases that decrease the sentiment score
const NEGATIVE_KEYWORDS = [
  'bad', 'trash', 'horrible', 'terrible', 'boring', 'skip', 'change it',
  'awful', 'worst', 'lame', 'weak', 'dead', 'slow', 'drop', 'no',
  'tired', 'sleep', 'meh', 'cringe', 'pass', 'nah', 'nope',
  '😴', '💤', '👎', '🗑️', '❌',
];

function matchesKeyword(text, keyword) {
  if (/[^\u0000-\u007f]/.test(keyword)) return text.includes(keyword);
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(text);
}

/**
 * Analyze the sentiment of a single message.
 * @param {string} text - The message text
 * @returns {number} Score between -1 and +1
 */
function analyzeMessage(text) {
  if (!text || typeof text !== 'string') return 0;

  const lowerText = text.toLowerCase();

  let positiveCount = 0;
  let negativeCount = 0;

  // Count positive keyword matches
  POSITIVE_KEYWORDS.forEach((word) => {
    if (matchesKeyword(lowerText, word)) {
      positiveCount++;
    }
  });

  // Count negative keyword matches
  NEGATIVE_KEYWORDS.forEach((word) => {
    if (matchesKeyword(lowerText, word)) {
      negativeCount++;
    }
  });

  const total = positiveCount + negativeCount;
  if (total === 0) return 0; // Neutral

  // Normalize to -1 to +1
  const score = (positiveCount - negativeCount) / total;
  return Math.max(-1, Math.min(1, score)); // Clamp to [-1, 1]
}

/**
 * Aggregate sentiment scores from recent messages into a single room score.
 * More recent messages are weighted more heavily.
 * @param {Array} messages - Array of ChatMessage documents with sentimentScore and createdAt
 * @returns {number} Aggregated room sentiment score (-1 to +1)
 */
function aggregateRoomSentiment(messages) {
  if (!messages || messages.length === 0) return 0;

  const now = Date.now();
  let totalWeight = 0;
  let weightedSum = 0;

  messages.forEach((msg) => {
    if (msg.sentimentScore === null || msg.sentimentScore === undefined) return;

    // Messages in the last 2 minutes get full weight, older messages get less
    const ageMs = now - new Date(msg.createdAt).getTime();
    const ageMins = ageMs / 60000;
    const weight = Math.max(0.1, 1 - ageMins / 10); // Decay over 10 minutes

    weightedSum += msg.sentimentScore * weight;
    totalWeight += weight;
  });

  if (totalWeight === 0) return 0;

  const aggregated = weightedSum / totalWeight;
  return Math.max(-1, Math.min(1, aggregated));
}

/**
 * Get a human-readable label for a sentiment score.
 * @param {number} score 
 * @returns {string}
 */
function getSentimentLabel(score) {
  if (score >= 0.5) return 'Very Positive 🔥';
  if (score >= 0.2) return 'Positive 😊';
  if (score >= -0.2) return 'Neutral 😐';
  if (score >= -0.5) return 'Negative 😕';
  return 'Very Negative 😴';
}

module.exports = { analyzeMessage, aggregateRoomSentiment, getSentimentLabel };
