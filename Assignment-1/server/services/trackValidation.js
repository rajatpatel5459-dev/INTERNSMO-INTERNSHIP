const TRACK_TIMELINE_TYPES = ['sample_credit', 'trivia', 'glossary'];

function validateTrackTimeline(timeline, durationSeconds) {
  if (!Array.isArray(timeline)) {
    return 'Track timeline must be an array of metadata events.';
  }
  if (timeline.length && (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) {
    return 'Track duration must be valid before adding metadata events.';
  }

  for (const [index, entry] of timeline.entries()) {
    const number = index + 1;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return `Timeline entry ${number} must be an object.`;
    }
    if (!Number.isInteger(entry.ts) || entry.ts < 0) {
      return `Timeline entry ${number} timestamp must be a non-negative whole number of seconds.`;
    }
    if (entry.ts > durationSeconds) {
      return `Timeline entry ${number} timestamp cannot exceed the track duration.`;
    }
    if (!TRACK_TIMELINE_TYPES.includes(entry.type)) {
      return `Timeline entry ${number} type must be sample_credit, trivia, or glossary.`;
    }
    if (typeof entry.text !== 'string' || !entry.text.trim()) {
      return `Timeline entry ${number} must include a note or fact.`;
    }
  }

  return null;
}

module.exports = { TRACK_TIMELINE_TYPES, validateTrackTimeline };
