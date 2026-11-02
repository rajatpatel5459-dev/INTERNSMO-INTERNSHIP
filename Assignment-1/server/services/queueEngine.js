function sortQueue(entries) {
  return [...entries].sort((a, b) => (
    Number(Boolean(b.isBattleWinner)) - Number(Boolean(a.isBattleWinner)) ||
    (b.votes || 0) - (a.votes || 0) ||
    (a.position || 0) - (b.position || 0)
  ));
}

function uniqueQueue(entries, currentTrackId) {
  const seenTrackIds = new Set();
  const currentId = trackIdOf(currentTrackId);
  return sortQueue(entries).filter((entry) => {
    const id = trackIdOf(entry.track || entry.trackId || entry.id);
    if (!id) return false;
    if (id === currentId || seenTrackIds.has(id)) return false;
    seenTrackIds.add(id);
    return true;
  });
}

function trackIdOf(track) {
  if (!track) return '';
  if (typeof track === 'object') {
    if (typeof track.toHexString === 'function') return track.toHexString();
    return trackIdOf(track._id || track.id);
  }
  return String(track);
}

function hasVoted(entries, voterId) {
  return entries.some((entry) => (
    (entry.voters || []).some((voter) => String(voter) === String(voterId))
  ));
}

function selectSoundclashWinner(candidates) {
  return [...candidates]
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => (
      (b.candidate.votes || 0) - (a.candidate.votes || 0) || a.index - b.index
    ))[0]?.candidate || null;
}

function prependBattleWinner(queue, winner) {
  const remainingQueue = uniqueQueue(queue, winner.track);
  const updatedQueue = [
    {
      track: winner.track,
      addedBy: winner.submittedBy,
      votes: 0,
      position: 0,
      isBattleWinner: true,
    },
    ...remainingQueue.map((entry, index) => {
      const plainEntry = entry.toObject ? entry.toObject() : entry;
      return { ...plainEntry, position: (index + 1) * 1000 };
    }),
  ];
  return updatedQueue;
}

module.exports = {
  sortQueue,
  uniqueQueue,
  hasVoted,
  selectSoundclashWinner,
  prependBattleWinner,
};
