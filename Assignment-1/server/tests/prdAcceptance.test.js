const test = require('node:test');
const assert = require('node:assert/strict');
const {
  checkCompatibility,
  pickBestSegue,
} = require('../services/acousticMatcher');
const {
  analyzeMessage,
  aggregateRoomSentiment,
} = require('../services/sentimentEngine');
const { answerTrackQuestion } = require('../services/aiDjEngine');
const {
  sortQueue,
  uniqueQueue,
  hasVoted,
  selectSoundclashWinner,
  prependBattleWinner,
} = require('../services/queueEngine');
const {
  isLoungeMember,
  canControlLounge,
  canRemoveQueueEntry,
  canCreateLounge,
  isLoungeHost,
} = require('../services/accessPolicy');
const { validateTrackTimeline } = require('../services/trackValidation');
const Lounge = require('../models/Lounge');
const QueueEvent = require('../models/QueueEvent');
const {
  connectedParticipants,
  isUnexpectedDisconnect,
} = require('../services/loungePresence');

function track(id, bpm, camelotKey, energy = 0.5) {
  return { _id: id, acoustic: { bpm, camelotKey, energy, valence: 0.5 } };
}

test('track metadata timeline validates timestamps, event types, and note text', () => {
  assert.equal(validateTrackTimeline([], 180), null);
  assert.equal(validateTrackTimeline([
    { ts: 12, type: 'sample_credit', text: 'Sample note' },
    { ts: 90, type: 'trivia', text: 'Track fact' },
    { ts: 180, type: 'glossary', text: 'Production term' },
  ], 180), null);
  assert.match(validateTrackTimeline([{ ts: -1, type: 'trivia', text: 'Fact' }], 180), /non-negative/);
  assert.match(validateTrackTimeline([{ ts: 181, type: 'trivia', text: 'Fact' }], 180), /track duration/);
  assert.match(validateTrackTimeline([{ ts: 1.5, type: 'trivia', text: 'Fact' }], 180), /whole number/);
  assert.match(validateTrackTimeline([{ ts: 1, type: 'unknown', text: 'Fact' }], 180), /type must be/);
  assert.match(validateTrackTimeline([{ ts: 1, type: 'trivia', text: '  ' }], 180), /note or fact/);
  assert.match(validateTrackTimeline(null, 180), /must be an array/);
});

test('queue removal events are accepted by the event log schema', () => {
  const event = new QueueEvent({
    lounge: '507f1f77bcf86cd799439011',
    user: '507f1f77bcf86cd799439012',
    type: 'trackRemoved',
    payload: { trackId: '507f1f77bcf86cd799439013' },
  });

  assert.equal(event.validateSync(), undefined);
});

test('AI segue outro window defaults to five seconds and validates configured bounds', () => {
  const hostId = '507f1f77bcf86cd799439011';
  const defaultLounge = new Lounge({ name: 'Default room', host: hostId });
  const configuredLounge = new Lounge({
    name: 'Configured room',
    host: hostId,
    settings: { aiOutroWindowSeconds: 15 },
  });
  const invalidLounge = new Lounge({
    name: 'Invalid room',
    host: hostId,
    settings: { aiOutroWindowSeconds: 4 },
  });

  assert.equal(defaultLounge.settings.aiOutroWindowSeconds, 5);
  assert.equal(configuredLounge.settings.aiOutroWindowSeconds, 15);
  assert.ok(invalidLounge.validateSync().errors['settings.aiOutroWindowSeconds']);
});

test('acoustic compatibility enforces tempo, half/double time, and Camelot rules', () => {
  const current = track('current', 120, '8A');
  assert.equal(checkCompatibility(current, track('same', 120, '8A')).compatible, true);
  assert.equal(checkCompatibility(current, track('adjacent', 129.6, '9A')).compatible, true);
  assert.equal(checkCompatibility(current, track('relative', 110.4, '8B')).compatible, true);
  assert.equal(checkCompatibility(current, track('half', 60, '7A')).compatible, true);
  assert.equal(checkCompatibility(current, track('double', 240, '9A')).compatible, true);
  assert.equal(checkCompatibility(current, track('tempo-out', 130, '8A')).compatible, false);
  assert.equal(checkCompatibility(current, track('key-clash', 120, '10A')).compatible, false);
  assert.equal(checkCompatibility(track('invalid', 0, '8A'), track('next', 120, '8A')).compatible, false);
});

test('all Camelot keys have only same, adjacent, and relative-key matches', () => {
  for (let number = 1; number <= 12; number += 1) {
    for (const letter of ['A', 'B']) {
      const current = track('current', 120, `${number}${letter}`);
      const adjacent = number === 12 ? 1 : number + 1;
      const assertCompatible = (key) => assert.equal(
        checkCompatibility(current, track('candidate', 120, key)).compatible,
        true,
        `${number}${letter} should accept ${key}`
      );
      assertCompatible(`${number}${letter}`);
      assertCompatible(`${adjacent}${letter}`);
      assertCompatible(`${number}${letter === 'A' ? 'B' : 'A'}`);
    }
  }
});

test('20 simulated segue decisions always satisfy both hard acoustic rules', () => {
  const validKeys = ['8A', '7A', '9A', '8B'];
  for (let index = 0; index < 20; index += 1) {
    const current = track('current', 100 + index * 2, '8A', 0.4);
    const candidates = [
      track('invalid-tempo', current.acoustic.bpm * 1.25, '8A'),
      track('invalid-key', current.acoustic.bpm, '10A'),
      track(`valid-${index}`, current.acoustic.bpm * 0.5, validKeys[index % validKeys.length], index / 20),
    ];
    const selected = pickBestSegue(current, candidates, (index % 3) - 1, 8);
    assert.ok(selected, `Expected a valid candidate for run ${index + 1}`);
    assert.equal(checkCompatibility(current, selected, 8).compatible, true);
  }
});

test('segue ranking prefers harmony and sentiment fit and avoids recent tracks', () => {
  const current = track('current', 120, '8A', 0.5);
  const candidates = [
    track('played-recently', 120, '8A', 0.8),
    track('fresh-compatible', 120, '8B', 0.8),
    track('fresh-wrong-energy', 120, '8A', 0.1),
  ];
  assert.equal(
    pickBestSegue(current, candidates, 1, 8, ['played-recently'])._id,
    'fresh-compatible'
  );
});

test('sentiment score responds to clear positive and negative chat shifts', () => {
  assert.ok(analyzeMessage('This track is amazing, love it!') > 0);
  assert.ok(analyzeMessage('This is boring, skip it') < 0);
  assert.equal(analyzeMessage('The next song is on now'), 0);

  const positive = Array.from({ length: 5 }, () => ({
    sentimentScore: 1,
    createdAt: new Date(),
  }));
  const negative = Array.from({ length: 5 }, () => ({
    sentimentScore: -1,
    createdAt: new Date(),
  }));
  assert.ok(aggregateRoomSentiment(positive) > 0.9);
  assert.ok(aggregateRoomSentiment(negative) < -0.9);
});

test('sentiment matcher reaches 85% on a small labeled smoke set', () => {
  const labeledMessages = [
    { text: 'This track is fire', expected: 1 },
    { text: 'I love this song', expected: 1 },
    { text: 'That was an amazing vibe', expected: 1 },
    { text: "Let's go, this slaps", expected: 1 },
    { text: 'This beat is sick', expected: 1 },
    { text: 'The energy is high', expected: 1 },
    { text: 'This is boring', expected: -1 },
    { text: 'Please skip this track', expected: -1 },
    { text: 'That song is trash', expected: -1 },
    { text: 'I feel tired', expected: -1 },
    { text: 'This is awful', expected: -1 },
    { text: 'The track is lame', expected: -1 },
    { text: 'The artist is playing a new track', expected: 0 },
    { text: 'What time does it start', expected: 0 },
    { text: 'Listening with friends tonight', expected: 0 },
    { text: 'There are three tracks in the queue', expected: 0 },
    { text: 'The next song is on now', expected: 0 },
    { text: 'Tell me the name of the album', expected: 0 },
    { text: 'The room is open until midnight', expected: 0 },
    { text: 'I added the track to the queue', expected: 0 },
  ];
  const correct = labeledMessages.filter(({ text, expected }) => {
    const score = analyzeMessage(text);
    const actual = score > 0 ? 1 : score < 0 ? -1 : 0;
    return actual === expected;
  }).length;

  assert.ok(
    correct / labeledMessages.length >= 0.85,
    `Expected at least 85% smoke-set accuracy; got ${correct}/${labeledMessages.length}`
  );
});

test('AI DJ Q&A cites matched track notes and declines unsupported questions', async () => {
  const currentTrack = {
    title: 'Test Track',
    artist: 'Test Artist',
    acoustic: { bpm: 120, camelotKey: '8A', energy: 0.6 },
    timeline: [{ ts: 12, type: 'trivia', text: 'Recorded in Berlin with analog synths.' }],
  };
  const grounded = await answerTrackQuestion('Where was this recorded?', currentTrack);
  assert.match(grounded.answer, /Recorded in Berlin with analog synths/);
  assert.deepEqual(grounded.sources, [
    { ts: 12, type: 'trivia', text: 'Recorded in Berlin with analog synths.' },
  ]);

  const unsupported = await answerTrackQuestion('Who played the drums?', currentTrack);
  assert.match(unsupported.answer, /I don't have specific details/);
  assert.deepEqual(unsupported.sources, []);
});

test('queue votes sort stably, prevent duplicate votes, and select a deterministic battle winner', () => {
  const queue = [
    { id: 'later', position: 2000, votes: 1, voters: ['u1'] },
    { id: 'first', position: 1000, votes: 1, voters: [] },
    { id: 'popular', position: 3000, votes: 4, voters: ['u2'] },
  ];
  assert.deepEqual(sortQueue(queue).map((entry) => entry.id), ['popular', 'first', 'later']);
  assert.equal(hasVoted(queue, 'u1'), true);
  assert.equal(hasVoted(queue, 'u3'), false);
  assert.equal(selectSoundclashWinner([
    { id: 'tie-first', votes: 2 },
    { id: 'tie-second', votes: 2 },
    { id: 'winner', votes: 3 },
  ]).id, 'winner');
  assert.equal(selectSoundclashWinner([
    { id: 'tie-first', votes: 2 },
    { id: 'tie-second', votes: 2 },
  ]).id, 'tie-first');
  assert.deepEqual(
    prependBattleWinner(queue, { track: 'battle-winner', submittedBy: 'host', votes: 5 })
      .map((entry) => entry.track || entry.id),
    ['battle-winner', 'popular', 'first', 'later']
  );
  const resolvedQueue = prependBattleWinner(
    [{ track: 'highly-voted', votes: 99, position: 1000 }],
    { track: 'battle-winner', submittedBy: 'host', votes: 3 }
  );
  assert.equal(sortQueue(resolvedQueue)[0].track, 'battle-winner');
});

test('queue removes repeated tracks and the currently playing track', () => {
  const queue = [
    { track: 'repeated', votes: 0, position: 1000 },
    { track: 'other', votes: 1, position: 2000 },
    { track: 'repeated', votes: 4, position: 3000 },
    { track: 'current', votes: 2, position: 4000 },
  ];
  assert.deepEqual(
    uniqueQueue(queue, 'current').map((entry) => entry.track),
    ['repeated', 'other']
  );
  assert.deepEqual(
    uniqueQueue([
      { track: { _id: 'same' }, position: 1000 },
      { track: 'same', position: 2000 },
    ]).map((entry) => entry.track?._id || entry.track),
    ['same']
  );
  assert.deepEqual(
    prependBattleWinner(
      [{ track: 'battle-winner', position: 1000 }, { track: 'other', position: 2000 }],
      { track: 'battle-winner', submittedBy: 'host', votes: 2 }
    ).map((entry) => entry.track),
    ['battle-winner', 'other']
  );
});

test('lounge access policy separates membership, Co-DJ control, and host-only actions', () => {
  const lounge = {
    host: 'host-id',
    participants: ['host-id', 'listener-id', 'co-dj-id'],
    coDjs: ['co-dj-id'],
  };
  assert.equal(isLoungeMember(lounge, { id: 'listener-id', role: 'listener' }), true);
  assert.equal(canControlLounge(lounge, { id: 'listener-id', role: 'listener' }), false);
  assert.equal(canControlLounge(lounge, { id: 'co-dj-id', role: 'listener' }), true);
  assert.equal(canControlLounge(lounge, { id: 'host-id', role: 'listener' }), false);
  assert.equal(canControlLounge(lounge, { id: 'host-id', role: 'host' }), true);
  const listenerQueueEntry = { addedBy: 'listener-id' };
  const otherQueueEntry = { addedBy: 'other-listener-id' };
  assert.equal(canRemoveQueueEntry(lounge, listenerQueueEntry, { id: 'listener-id', role: 'listener' }), true);
  assert.equal(canRemoveQueueEntry(lounge, otherQueueEntry, { id: 'listener-id', role: 'listener' }), false);
  assert.equal(canRemoveQueueEntry(lounge, otherQueueEntry, { id: 'co-dj-id', role: 'listener' }), true);
  assert.equal(canRemoveQueueEntry(lounge, otherQueueEntry, { id: 'host-id', role: 'host' }), true);
  assert.equal(isLoungeHost(lounge, { id: 'co-dj-id', role: 'listener' }), false);
  assert.equal(isLoungeHost(lounge, { id: 'host-id', role: 'listener' }), false);
  assert.equal(isLoungeHost(lounge, { id: 'host-id', role: 'host' }), true);
  assert.equal(canCreateLounge({ role: 'host' }), true);
  assert.equal(canCreateLounge({ role: 'admin' }), true);
  assert.equal(canCreateLounge({ role: 'listener' }), false);
  assert.equal(canCreateLounge({ role: 'co_dj' }), false);
  assert.equal(isLoungeMember(lounge, { id: 'outsider-id', role: 'listener' }), false);
  assert.equal(isLoungeMember(lounge, { id: 'admin-id', role: 'admin' }), true);
});

test('live lounge presence deduplicates sockets and excludes disconnected participants', () => {
  assert.deepEqual(connectedParticipants([
    { data: { userId: 'host-id', displayName: 'Host', role: 'host' } },
    { data: { userId: 'listener-id', displayName: 'Listener', role: 'listener' } },
    { data: { userId: 'host-id', displayName: 'Host', role: 'host' } },
    { data: { displayName: 'Unauthenticated' } },
  ]), [
    { _id: 'host-id', displayName: 'Host', role: 'host' },
    { _id: 'listener-id', displayName: 'Listener', role: 'listener' },
  ]);
  assert.deepEqual(connectedParticipants([]), []);
});

test('only tab, refresh, and connection-loss socket reasons mark a host disconnected', () => {
  for (const reason of ['transport close', 'ping timeout', 'transport error']) {
    assert.equal(isUnexpectedDisconnect(reason), true, `${reason} should mark a host disconnected`);
  }
  for (const reason of ['client namespace disconnect', 'server namespace disconnect']) {
    assert.equal(isUnexpectedDisconnect(reason), false, `${reason} should not mark a host disconnected`);
  }
});
