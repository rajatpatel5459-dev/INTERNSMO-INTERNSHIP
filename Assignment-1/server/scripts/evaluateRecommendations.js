const { rankCandidates } = require('../services/recommendationEngine');
const { tracks, users } = require('../evaluation/recommendationHoldout');

function evaluateHoldout(datasetTracks = tracks, datasetUsers = users, recommendationsPerUser = 5) {
  const results = datasetUsers.map((user) => {
    const historyTracks = user.historyTrackIds.map((id) => datasetTracks.find((track) => track._id === id));
    const tasteProfile = {
      avgBpm: historyTracks.reduce((sum, track) => sum + track.acoustic.bpm, 0) / historyTracks.length,
      avgEnergy: historyTracks.reduce((sum, track) => sum + track.acoustic.energy, 0) / historyTracks.length,
      avgValence: historyTracks.reduce((sum, track) => sum + track.acoustic.valence, 0) / historyTracks.length,
    };
    const heardTrackIds = new Set(user.historyTrackIds);
    const candidates = datasetTracks.filter((track) => !heardTrackIds.has(track._id));
    const collaborativeScores = Object.fromEntries(
      user.coListenerTrainingLikes.map((trackId) => [trackId, 2])
    );
    const recommended = rankCandidates(
      candidates,
      tasteProfile,
      collaborativeScores,
      recommendationsPerUser
    );
    const relevantTrackIds = new Set(user.heldoutRelevantTrackIds);
    const relevantAtK = recommended.filter((track) => relevantTrackIds.has(track._id)).length;

    return {
      userId: user.userId,
      cohort: user.cohort,
      relevantAtK,
      precisionAtK: relevantAtK / recommendationsPerUser,
      recommendedTrackIds: recommended.map((track) => track._id),
      heldoutRelevantTrackIds: user.heldoutRelevantTrackIds,
    };
  });

  const totalRelevantAtK = results.reduce((sum, result) => sum + result.relevantAtK, 0);
  const totalRecommendations = results.length * recommendationsPerUser;
  const precisionAtK = totalRelevantAtK / totalRecommendations;

  return {
    metric: `Precision@${recommendationsPerUser}`,
    evaluation: 'deterministic synthetic held-out interaction set',
    users: datasetUsers.length,
    catalogTracks: datasetTracks.length,
    historyInteractions: datasetUsers.reduce((sum, user) => sum + user.historyTrackIds.length, 0),
    heldoutPositiveInteractions: datasetUsers.reduce((sum, user) => sum + user.heldoutRelevantTrackIds.length, 0),
    coListenerTrainingLikes: datasetUsers.reduce((sum, user) => sum + user.coListenerTrainingLikes.length, 0),
    recommendationsPerUser,
    totalRelevantAtK,
    totalRecommendations,
    precisionAtK,
    target: 0.6,
    meetsTarget: precisionAtK >= 0.6,
    perUser: results,
  };
}

if (require.main === module) {
  console.log(JSON.stringify(evaluateHoldout(), null, 2));
}

module.exports = { evaluateHoldout };
