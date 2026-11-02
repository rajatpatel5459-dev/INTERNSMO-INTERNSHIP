const archetypes = [
  { name: 'slow-low', bpm: 72, energy: 0.18, valence: 0.2 },
  { name: 'slow-bright', bpm: 88, energy: 0.35, valence: 0.88 },
  { name: 'mid-low', bpm: 108, energy: 0.48, valence: 0.24 },
  { name: 'mid-bright', bpm: 124, energy: 0.68, valence: 0.82 },
  { name: 'fast-mid', bpm: 148, energy: 0.56, valence: 0.52 },
  { name: 'fast-high', bpm: 174, energy: 0.92, valence: 0.64 },
];

const tracks = archetypes.flatMap((archetype, cohortIndex) => (
  Array.from({ length: 8 }, (_, trackIndex) => ({
    _id: `cohort-${cohortIndex}-track-${trackIndex}`,
    cohort: archetype.name,
    title: `${archetype.name} sample ${trackIndex + 1}`,
    acoustic: {
      bpm: archetype.bpm + ((trackIndex % 3) - 1) * 2,
      energy: Math.min(1, Math.max(0, archetype.energy + ((trackIndex % 3) - 1) * 0.025)),
      valence: Math.min(1, Math.max(0, archetype.valence + ((trackIndex % 4) - 1.5) * 0.02)),
    },
  }))
));

const users = archetypes.map((archetype, cohortIndex) => {
  const cohortTracks = tracks.filter((track) => track.cohort === archetype.name);
  return {
    userId: `holdout-user-${cohortIndex + 1}`,
    cohort: archetype.name,
    historyTrackIds: cohortTracks.slice(0, 3).map((track) => track._id),
    heldoutRelevantTrackIds: cohortTracks.slice(3, 6).map((track) => track._id),
    coListenerTrainingLikes: [cohortTracks[3]._id],
  };
});

module.exports = { tracks, users };
