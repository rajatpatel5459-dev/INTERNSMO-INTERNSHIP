const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const Track = require('../models/Track');
const { loadAssetTracks, createDevelopmentUserData } = require('../seed');
const { TRACK_TIMELINE_TYPES, validateTrackTimeline } = require('../services/trackValidation');
const { checkCompatibility } = require('../services/acousticMatcher');

test('new development accounts require passwords from local environment configuration', () => {
  const userDefinition = {
    displayName: 'Demo Host',
    email: 'host@example.com',
    passwordEnv: 'DEMO_HOST_PASSWORD',
    role: 'host',
  };

  assert.throws(
    () => createDevelopmentUserData(userDefinition, {}),
    /DEMO_HOST_PASSWORD must be set/
  );
  assert.throws(
    () => createDevelopmentUserData(userDefinition, { DEMO_HOST_PASSWORD: 'short' }),
    /DEMO_HOST_PASSWORD must be set/
  );

  const accountData = createDevelopmentUserData(userDefinition, {
    DEMO_HOST_PASSWORD: 'test-only-password',
  });
  assert.equal(accountData.passwordHash, 'test-only-password');
  assert.equal(Object.hasOwn(accountData, 'passwordEnv'), false);
});

test('asset seed manifest uses original synthetic assets and provides a three-track authored segue chain', () => {
  const seededTracks = loadAssetTracks();

  assert.equal(seededTracks.length, 5);
  assert.deepEqual(
    seededTracks.map(({ trackData }) => trackData.durationSeconds),
    [16, 16, 16, 16, 16]
  );
  assert.deepEqual(seededTracks.map(({ audioFormat }) => audioFormat), ['wav', 'wav', 'wav', 'wav', 'wav']);
  assert.deepEqual(
    seededTracks.map(({ trackData }) => trackData.timeline.length),
    [2, 2, 2, 2, 2]
  );
  assert.deepEqual(
    seededTracks.slice(0, 3).map(({ trackData }) => trackData.title),
    ['Demo Track 01', 'Demo Track 02', 'Demo Track 03']
  );
  assert.equal(seededTracks.every(({ trackData }) => trackData.acoustic.demoOnly), true);
  assert.deepEqual(
    seededTracks.slice(0, 3).map(({ trackData }) => trackData.acoustic),
    [
      { bpm: 100, camelotKey: '8A', energy: 0.60, valence: 0.55, demoOnly: true },
      { bpm: 104, camelotKey: '9A', energy: 0.65, valence: 0.58, demoOnly: true },
      { bpm: 108, camelotKey: '9B', energy: 0.70, valence: 0.62, demoOnly: true },
    ]
  );
  for (let index = 0; index < 2; index += 1) {
    assert.equal(checkCompatibility(
      seededTracks[index].trackData,
      seededTracks[index + 1].trackData
    ).compatible, true);
  }
  assert.equal(checkCompatibility(
    seededTracks[0].trackData,
    seededTracks[2].trackData
  ).compatible, false);

  for (const seededTrack of seededTracks) {
    assert.equal(fs.existsSync(seededTrack.audioSourcePath), true);
    assert.equal(fs.existsSync(seededTrack.coverSourcePath), true);
    const audio = fs.readFileSync(seededTrack.audioSourcePath);
    const cover = fs.readFileSync(seededTrack.coverSourcePath);
    assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
    assert.equal(audio.toString('ascii', 8, 12), 'WAVE');
    assert.deepEqual([...cover.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(
      validateTrackTimeline(seededTrack.trackData.timeline, seededTrack.trackData.durationSeconds),
      null
    );
    assert.deepEqual(
      seededTrack.trackData.timeline.map(({ type }) => type),
      ['sample_credit', 'trivia']
    );
    assert.deepEqual(
      seededTrack.trackData.timeline.map(({ ts }) => ts),
      [0, 5]
    );
    assert.equal(
      seededTrack.trackData.timeline.every(
        ({ type, text }) => TRACK_TIMELINE_TYPES.includes(type) && text.trim()
      ),
      true
    );
    assert.equal(new Track(seededTrack.trackData).validateSync(), undefined);
    assert.match(seededTrack.trackData.audioAssetUrl, /^\/uploads\/tracks\/seed-.+\.wav$/);
    assert.match(seededTrack.trackData.coverImageUrl, /^\/uploads\/tracks\/seed-.+\.png$/);
  }
});
