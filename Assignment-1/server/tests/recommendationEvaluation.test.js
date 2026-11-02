const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateHoldout } = require('../scripts/evaluateRecommendations');

test('recommendation engine meets Precision@5 on its synthetic held-out set', () => {
  const report = evaluateHoldout();

  assert.equal(report.users, 6);
  assert.equal(report.catalogTracks, 48);
  assert.equal(report.totalRecommendations, 30);
  assert.equal(report.precisionAtK, 0.6);
  assert.equal(report.meetsTarget, true);
});
