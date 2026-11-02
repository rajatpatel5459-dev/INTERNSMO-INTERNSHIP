const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Lounge = require('../models/Lounge');
const Track = require('../models/Track');
const QueueEvent = require('../models/QueueEvent');
const ChatMessage = require('../models/ChatMessage');
const { resolveExpiredBattle } = require('../services/soundclashService');

const mongoUri = process.env.PRD_TEST_MONGO_URI;

test('expired Soundclash resolves once under concurrent scheduler calls', {
  skip: !mongoUri,
}, async (t) => {
  const parsedUri = new URL(mongoUri);
  parsedUri.pathname = `/aidj_prd_test_${process.pid}`;
  await mongoose.connect(parsedUri.toString());
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const [popularTrack, otherTrack] = await Track.create([
    {
      title: 'Popular Candidate',
      artist: 'Test Artist',
      durationSeconds: 180,
      acoustic: { bpm: 120, camelotKey: '8A', energy: 0.6, valence: 0.6 },
    },
    {
      title: 'Other Candidate',
      artist: 'Test Artist',
      durationSeconds: 180,
      acoustic: { bpm: 122, camelotKey: '9A', energy: 0.6, valence: 0.6 },
    },
  ]);
  const lounge = await Lounge.create({
    name: 'Scheduler acceptance test',
    host: new mongoose.Types.ObjectId(),
    soundclash: {
      active: true,
      closesAt: new Date(Date.now() - 1000),
      candidates: [
        { track: popularTrack._id, votes: 3, voters: [] },
        { track: otherTrack._id, votes: 1, voters: [] },
      ],
    },
  });
  const emittedEvents = [];
  const io = {
    to: () => ({
      emit: (eventName) => emittedEvents.push(eventName),
    }),
  };

  const results = await Promise.all([
    resolveExpiredBattle(lounge._id, null, io),
    resolveExpiredBattle(lounge._id, null, io),
  ]);
  const finalLounge = await Lounge.findById(lounge._id);

  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(finalLounge.soundclash.active, false);
  assert.equal(String(finalLounge.soundclash.winnerId), String(popularTrack._id));
  assert.equal(finalLounge.queue[0].isBattleWinner, true);
  assert.equal(String(finalLounge.queue[0].track), String(popularTrack._id));
  assert.equal(await QueueEvent.countDocuments({ lounge: lounge._id, type: 'battleResolved' }), 1);
  assert.equal(await ChatMessage.countDocuments({ lounge: lounge._id, msgType: 'dj_announcement' }), 1);
  assert.deepEqual(emittedEvents.sort(), ['lounge:chat:message', 'lounge:soundclash:resolved']);
});
