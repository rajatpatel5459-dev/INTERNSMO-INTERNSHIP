// controllers/soundclashController.js - Soundclash battles

const Lounge = require('../models/Lounge');
const Track = require('../models/Track');
const QueueEvent = require('../models/QueueEvent');
const { canControlLounge, isLoungeHost } = require('../services/accessPolicy');
const { resolveExpiredBattle } = require('../services/soundclashService');

function publicCandidates(candidates) {
  return candidates.map((candidate) => {
    const result = candidate.toObject ? candidate.toObject() : { ...candidate };
    delete result.voters;
    return result;
  });
}

// @route   POST /api/soundclash/:loungeId/submit
// @desc    Submit a track to the Soundclash battle queue
// @access  Private (any participant)
const submitTrack = async (req, res, next) => {
  try {
    const { trackId } = req.body;
    const lounge = await Lounge.findById(req.params.loungeId);

    if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });
    if (lounge.hostDisconnected) return res.status(423).json({ success: false, message: 'Soundclash queue updates are frozen until the host reconnects.' });
    if (!lounge.settings.soundclashEnabled) {
      return res.status(400).json({ success: false, message: 'Soundclash is disabled in this lounge.' });
    }
    if (lounge.soundclash.active) {
      return res.status(400).json({ success: false, message: 'A battle is already active. Wait for it to end.' });
    }
    if (lounge.locked && !canControlLounge(lounge, req.user)) {
      return res.status(403).json({ success: false, message: 'This lounge is locked.' });
    }

    const track = await Track.findById(trackId);
    if (!track) return res.status(404).json({ success: false, message: 'Track not found.' });
    const alreadyPlayingOrQueued = String(lounge.currentTrack || '') === String(trackId)
      || lounge.queue.some((entry) => String(entry.track) === String(trackId));
    if (alreadyPlayingOrQueued) {
      return res.status(409).json({ success: false, message: 'This track is already playing or in the queue.' });
    }

    // Max 4 candidates
    if (lounge.soundclash.candidates.length >= 4) {
      return res.status(400).json({ success: false, message: 'Maximum 4 candidates allowed per battle.' });
    }

    // Check if track is already a candidate
    const alreadySubmitted = lounge.soundclash.candidates.some(
      (c) => c.track.toString() === trackId
    );
    if (alreadySubmitted) {
      return res.status(400).json({ success: false, message: 'This track is already in the battle.' });
    }

    const updateFilter = {
      _id: lounge._id,
      status: { $ne: 'ended' },
      hostDisconnected: { $ne: true },
      'soundclash.active': false,
      'soundclash.candidates': { $not: { $elemMatch: { track: trackId } } },
      $expr: {
        $lt: [
          { $size: { $ifNull: ['$soundclash.candidates', []] } },
          4,
        ],
      },
    };
    if (!canControlLounge(lounge, req.user)) updateFilter.locked = { $ne: true };
    const updateResult = await Lounge.updateOne(updateFilter, {
      $push: {
        'soundclash.candidates': {
          track: trackId,
          submittedBy: req.user.id,
          votes: 0,
          voters: [],
        },
      },
      $inc: { __v: 1 },
    });
    if (!updateResult.modifiedCount) {
      return res.status(409).json({ success: false, message: 'Soundclash changed while submitting. Refresh and try again.' });
    }

    const updatedLounge = await Lounge.findById(lounge._id).select('soundclash');
    const candidates = publicCandidates(updatedLounge.soundclash.candidates);
    req.app.get('io').to(lounge._id.toString()).emit('lounge:soundclash:update', {
      event: 'lounge.soundclash.update',
      loungeId: lounge._id,
      payload: { active: updatedLounge.soundclash.active, candidates },
      ts: Date.now(),
    });

    res.status(200).json({
      success: true,
      message: `"${track.title}" submitted to Soundclash!`,
      candidates,
    });
  } catch (error) {
    next(error);
  }
};

const removeTrack = async (req, res, next) => {
  try {
    const lounge = await Lounge.findById(req.params.loungeId);
    if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });
    if (!isLoungeHost(lounge, req.user)) {
      return res.status(403).json({ success: false, message: 'Host or Admin access is required to remove a Soundclash track.' });
    }
    if (lounge.soundclash.active) {
      return res.status(400).json({ success: false, message: 'Tracks cannot be removed while a Soundclash battle is active.' });
    }

    const trackId = req.params.trackId;
    const updateResult = await Lounge.updateOne(
      {
        _id: lounge._id,
        __v: lounge.__v,
        'soundclash.active': false,
        soundclash: { $exists: true },
        'soundclash.candidates': { $elemMatch: { track: trackId } },
      },
      {
        $pull: { 'soundclash.candidates': { track: trackId } },
        $inc: { __v: 1 },
      }
    );
    if (!updateResult.modifiedCount) {
      const currentLounge = await Lounge.findById(lounge._id).select('soundclash');
      if (currentLounge?.soundclash.active) {
        return res.status(409).json({ success: false, message: 'Soundclash opened before the track could be removed. Refresh and try again.' });
      }
      return res.status(404).json({ success: false, message: 'Track not found among Soundclash candidates.' });
    }

    const updatedLounge = await Lounge.findById(lounge._id).select('soundclash');
    const candidates = publicCandidates(updatedLounge.soundclash.candidates);
    req.app.get('io').to(lounge._id.toString()).emit('lounge:soundclash:update', {
      event: 'lounge.soundclash.update',
      loungeId: lounge._id,
      payload: { active: updatedLounge.soundclash.active, candidates },
      ts: Date.now(),
    });

    return res.status(200).json({ success: true, candidates });
  } catch (error) {
    return next(error);
  }
};

// @route   POST /api/soundclash/:loungeId/open
// @desc   Open a Soundclash battle (Host only)
// @access  Private (host only)
const openBattle = async (req, res, next) => {
  try {
    const { durationSeconds = 60 } = req.body;
    const lounge = await Lounge.findById(req.params.loungeId);

    if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });

    if (!isLoungeHost(lounge, req.user)) {
      return res.status(403).json({ success: false, message: 'Host or Admin access is required to open a Soundclash battle.' });
    }

    if (lounge.soundclash.active) {
      return res.status(400).json({ success: false, message: 'A battle is already active.' });
    }

    if (lounge.soundclash.candidates.length < 2) {
      return res.status(400).json({ success: false, message: 'Need at least 2 candidates to start a battle.' });
    }
    if (!Number.isInteger(Number(durationSeconds)) || Number(durationSeconds) < 10 || Number(durationSeconds) > 300) {
      return res.status(400).json({ success: false, message: 'Battle duration must be between 10 and 300 seconds.' });
    }

    // Activate the battle
    const openedAt = new Date();
    const closesAt = new Date(openedAt.getTime() + Number(durationSeconds) * 1000);
    const openResult = await Lounge.updateOne(
      { _id: lounge._id, __v: lounge.__v, 'soundclash.active': false },
      {
        $set: {
          'soundclash.active': true,
          'soundclash.openedAt': openedAt,
          'soundclash.closesAt': closesAt,
          'soundclash.winnerId': null,
        },
        $inc: { __v: 1 },
      }
    );
    if (!openResult.modifiedCount) {
      return res.status(409).json({ success: false, message: 'Soundclash changed while opening. Refresh and try again.' });
    }
    const openedLounge = await Lounge.findById(lounge._id).select('soundclash');

    // Log the event
    await QueueEvent.create({
      lounge: lounge._id,
      user: req.user.id,
      type: 'battleOpened',
      payload: {
        candidates: openedLounge.soundclash.candidates.map((c) => c.track),
        closesAt: openedLounge.soundclash.closesAt,
      },
    });

    // Broadcast battle open event
    const io = req.app.get('io');
    io.to(lounge._id.toString()).emit('lounge:soundclash:open', {
      event: 'lounge.soundclash.open',
      loungeId: lounge._id,
      payload: {
        battleId: lounge._id,
        candidates: publicCandidates(openedLounge.soundclash.candidates),
        closesAt: openedLounge.soundclash.closesAt,
        durationSeconds: Number(durationSeconds),
      },
      ts: Date.now(),
    });

    res.status(200).json({
      success: true,
      message: '⚔️ Soundclash battle opened! Listeners can now vote!',
      soundclash: {
        active: openedLounge.soundclash.active,
        candidates: publicCandidates(openedLounge.soundclash.candidates),
        openedAt: openedLounge.soundclash.openedAt,
        closesAt: openedLounge.soundclash.closesAt,
        winnerId: openedLounge.soundclash.winnerId,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/soundclash/:loungeId/vote
// @desc    Vote for a candidate in the active Soundclash battle
// @access  Private
const voteInBattle = async (req, res, next) => {
  try {
    const { candidateTrackId } = req.body;
    const lounge = await Lounge.findById(req.params.loungeId);

    if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });
    if (lounge.hostDisconnected) return res.status(423).json({ success: false, message: 'Soundclash voting is frozen until the host reconnects.' });
    if (!lounge.soundclash.active) {
      return res.status(400).json({ success: false, message: 'No active Soundclash battle.' });
    }
    if (lounge.soundclash.closesAt && lounge.soundclash.closesAt.getTime() <= Date.now()) {
      return res.status(400).json({ success: false, message: 'Voting has closed for this Soundclash battle.' });
    }

    // Check if user already voted
    const alreadyVoted = lounge.soundclash.candidates.some((c) =>
      c.voters.some((v) => v.toString() === req.user.id)
    );
    if (alreadyVoted) {
      return res.status(400).json({ success: false, message: 'You have already voted in this battle.' });
    }

    // Find the candidate and add vote
    const candidate = lounge.soundclash.candidates.find(
      (c) => c.track.toString() === candidateTrackId
    );
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found in this battle.' });
    }

    const voteFilter = {
        _id: lounge._id,
        hostDisconnected: { $ne: true },
        'soundclash.active': true,
        'soundclash.closesAt': { $gt: new Date() },
        $and: [
          { 'soundclash.candidates': { $elemMatch: { track: candidateTrackId } } },
          { 'soundclash.candidates': { $not: { $elemMatch: { voters: req.user.id } } } },
        ],
      };
    if (lounge.locked && !canControlLounge(lounge, req.user)) voteFilter.locked = { $ne: true };
    const voteResult = await Lounge.updateOne(
      voteFilter,
      {
        $addToSet: { 'soundclash.candidates.$[candidate].voters': req.user.id },
        $inc: { 'soundclash.candidates.$[candidate].votes': 1, __v: 1 },
      },
      { arrayFilters: [{ 'candidate.track': candidateTrackId, 'candidate.voters': { $ne: req.user.id } }] }
    );
    if (!voteResult.modifiedCount) {
      return res.status(409).json({ success: false, message: 'You have already voted in this battle or voting has closed.' });
    }
    const updatedLounge = await Lounge.findById(lounge._id).select('soundclash');

    // Broadcast updated vote counts (without exposing voter IDs)
    const io = req.app.get('io');
    const voteCounts = updatedLounge.soundclash.candidates.map((c) => ({
      trackId: c.track,
      votes: c.votes,
    }));

    io.to(lounge._id.toString()).emit('lounge:soundclash:vote', {
      event: 'lounge.soundclash.vote',
      loungeId: lounge._id,
      payload: { voteCounts },
      ts: Date.now(),
    });

    res.status(200).json({ success: true, message: 'Vote counted!', voteCounts });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/soundclash/:loungeId/resolve
// @desc    Resolve the Soundclash battle and announce the winner
// @access  Private (host only)
const resolveBattle = async (req, res, next) => {
  try {
    const lounge = await Lounge.findById(req.params.loungeId);

    if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });

    if (!canControlLounge(lounge, req.user)) {
      return res.status(403).json({ success: false, message: 'Host or Co-DJ access is required to resolve the battle.' });
    }

    if (!lounge.soundclash.active) {
      return res.status(400).json({ success: false, message: 'No active Soundclash battle to resolve.' });
    }
    if (!lounge.soundclash.closesAt || lounge.soundclash.closesAt > new Date()) {
      return res.status(400).json({ success: false, message: 'Soundclash voting is still open.' });
    }

    const result = await resolveExpiredBattle(lounge._id, req.user.id, req.app.get('io'));
    if (!result) {
      return res.status(409).json({ success: false, message: 'Soundclash was already resolved. Refresh the room state.' });
    }

    res.status(200).json({
      success: true,
      message: 'Battle resolved!',
      winner: result.winner,
      announcement: result.announcement,
    });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/soundclash/:loungeId
// @desc    Get the current Soundclash state
// @access  Private
const getSoundclashState = async (req, res, next) => {
  try {
    const lounge = await Lounge.findById(req.params.loungeId)
      .populate('soundclash.candidates.track', 'title artist album genre coverImageUrl durationSeconds acoustic');

    if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });

    // Return candidates without voter IDs (privacy)
    const candidates = lounge.soundclash.candidates.map((c) => ({
      track: c.track,
      submittedBy: c.submittedBy,
      votes: c.votes,
    }));
    const votedCandidate = lounge.soundclash.candidates.find((candidate) =>
      candidate.voters.some((voterId) => voterId.toString() === req.user.id)
    );

    res.status(200).json({
      success: true,
      soundclash: {
        active: lounge.soundclash.active,
        candidates,
        hasVoted: Boolean(votedCandidate),
        votedTrackId: votedCandidate ? votedCandidate.track._id || votedCandidate.track : null,
        openedAt: lounge.soundclash.openedAt,
        closesAt: lounge.soundclash.closesAt,
        winnerId: lounge.soundclash.winnerId,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { submitTrack, removeTrack, openBattle, voteInBattle, resolveBattle, getSoundclashState };
