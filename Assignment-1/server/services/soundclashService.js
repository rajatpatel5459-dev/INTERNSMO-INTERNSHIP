const Lounge = require('../models/Lounge');
const Track = require('../models/Track');
const QueueEvent = require('../models/QueueEvent');
const ChatMessage = require('../models/ChatMessage');
const { generateSoundclashAnnouncement } = require('./aiDjEngine');
const { selectSoundclashWinner, prependBattleWinner, sortQueue, uniqueQueue } = require('./queueEngine');

function publicQueue(entries) {
  return sortQueue(entries).map((entry) => {
    const result = entry.toObject ? entry.toObject() : { ...entry };
    delete result.voters;
    return result;
  });
}

async function resolveExpiredBattle(loungeId, actorId, io) {
  let resolution = null;
  for (let attempt = 0; attempt < 5 && !resolution; attempt += 1) {
    const lounge = await Lounge.findById(loungeId);
    if (!lounge || !lounge.soundclash.active) return null;

    const now = new Date();
    if (!lounge.soundclash.closesAt || lounge.soundclash.closesAt > now) return null;

    const winner = selectSoundclashWinner(lounge.soundclash.candidates);
    if (!winner) return null;
    const winningTrack = await Track.findById(winner.track);
    if (!winningTrack) throw new Error('The winning Soundclash track no longer exists.');

    const resolvedCandidates = lounge.soundclash.candidates.map((candidate) => ({
      trackId: candidate.track,
      votes: candidate.votes,
    }));
    const totalVotes = resolvedCandidates.reduce((sum, candidate) => sum + candidate.votes, 0);
    const updateResult = await Lounge.updateOne(
      {
        _id: lounge._id,
        __v: lounge.__v,
        'soundclash.active': true,
        'soundclash.closesAt': { $lte: now },
      },
      {
        $set: {
          queue: prependBattleWinner(uniqueQueue(lounge.queue, lounge.currentTrack), winner),
          'soundclash.active': false,
          'soundclash.winnerId': winner.track,
          'soundclash.candidates': [],
        },
        $inc: { __v: 1 },
      }
    );

    if (updateResult.modifiedCount) {
      resolution = {
        loungeId: lounge._id,
        correlationId: lounge.correlationId,
        winner,
        winningTrack,
        resolvedCandidates,
        totalVotes,
        actorId,
      };
    }
  }
  if (!resolution) return null;

  const announcement = generateSoundclashAnnouncement(
    resolution.winningTrack,
    resolution.winner.votes,
    resolution.totalVotes
  );
  console.log(JSON.stringify({
    event: 'queue.mutation.completed',
    category: 'queue_mutation',
    queueMutation: true,
    requestId: null,
    correlationId: resolution.correlationId || String(resolution.loungeId),
    loungeId: String(resolution.loungeId),
    userId: resolution.actorId ? String(resolution.actorId) : null,
    operation: 'soundclash.resolve',
    source: resolution.actorId ? 'api' : 'scheduler',
    statusCode: 200,
  }));
  const [message, updatedLounge] = await Promise.all([
    ChatMessage.create({
      lounge: resolution.loungeId,
      user: null,
      msgType: 'dj_announcement',
      body: announcement,
    }),
    Lounge.findById(resolution.loungeId)
      .populate('queue.track', 'title artist acoustic coverImageUrl durationSeconds'),
  ]);
  await QueueEvent.create({
    lounge: resolution.loungeId,
    user: resolution.actorId || null,
    type: 'battleResolved',
    payload: {
      winnerId: resolution.winner.track,
      winnerVotes: resolution.winner.votes,
      totalVotes: resolution.totalVotes,
      candidates: resolution.resolvedCandidates,
    },
  });

  if (io) {
    io.to(String(resolution.loungeId)).emit('lounge:chat:message', {
      event: 'lounge.chat.message',
      loungeId: resolution.loungeId,
      payload: {
        messageId: message._id,
        user: { id: null, displayName: 'AI DJ' },
        body: message.body,
        msgType: message.msgType,
        createdAt: message.createdAt,
      },
      ts: Date.now(),
    });
    io.to(String(resolution.loungeId)).emit('lounge:soundclash:resolved', {
      event: 'lounge.soundclash.resolved',
      loungeId: resolution.loungeId,
      payload: {
        winningTrackId: resolution.winner.track,
        winningTrack: resolution.winningTrack,
        totalVotes: resolution.totalVotes,
        announcement,
        newQueue: publicQueue(updatedLounge.queue),
      },
      ts: Date.now(),
    });
  }

  return {
    winner: resolution.winningTrack,
    announcement,
    totalVotes: resolution.totalVotes,
  };
}

async function resolveExpiredBattles(io) {
  const expiredLounges = await Lounge.find({
    'soundclash.active': true,
    'soundclash.closesAt': { $lte: new Date() },
  }).select('_id').limit(50);

  for (const lounge of expiredLounges) {
    try {
      await resolveExpiredBattle(lounge._id, null, io);
    } catch (error) {
      console.error(`Could not resolve Soundclash for lounge ${lounge._id}:`, error.message);
    }
  }
}

module.exports = { resolveExpiredBattle, resolveExpiredBattles };
