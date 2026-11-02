// controllers/queueController.js - Vote on tracks, reorder queue, add tracks

const Lounge = require('../models/Lounge');
const Track = require('../models/Track');
const QueueEvent = require('../models/QueueEvent');
const { sortQueue, uniqueQueue } = require('../services/queueEngine');
const { canControlLounge, canRemoveQueueEntry } = require('../services/accessPolicy');

function publicQueue(entries) {
  return sortQueue(entries).map((entry) => {
    const result = entry.toObject ? entry.toObject() : { ...entry };
    delete result.voters;
    return result;
  });
}

// @route   POST /api/queue/:loungeId/add
// @desc    Add a track to the queue
// @access  Private (must be in the lounge)
const addTrackToQueue = async (req, res, next) => {
  try {
    const { trackId } = req.body;
    const lounge = await Lounge.findById(req.params.loungeId);

    if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });
    if (lounge.status === 'ended') return res.status(400).json({ success: false, message: 'Session has ended.' });
    if (lounge.hostDisconnected) return res.status(423).json({ success: false, message: 'Queue controls are frozen until the host reconnects.' });
    if (lounge.locked && !canControlLounge(lounge, req.user)) {
      return res.status(403).json({ success: false, message: 'This lounge is locked.' });
    }

    const track = await Track.findById(trackId);
    if (!track) return res.status(404).json({ success: false, message: 'Track not found.' });
    const isCurrentTrack = String(lounge.currentTrack || '') === String(trackId);
    const isAlreadyQueued = lounge.queue.some((entry) => String(entry.track) === String(trackId));
    if (isCurrentTrack || isAlreadyQueued) {
      return res.status(409).json({ success: false, message: 'This track is already playing or in the queue.' });
    }

    // Calculate position (add to end with spacing of 1000)
    const lastPosition = lounge.queue.reduce((maximum, entry) => Math.max(maximum, entry.position || 0), 0);
    const updateFilter = {
      _id: lounge._id,
      status: { $ne: 'ended' },
      hostDisconnected: { $ne: true },
      currentTrack: { $ne: trackId },
      queue: { $not: { $elemMatch: { track: trackId } } },
    };
    if (!canControlLounge(lounge, req.user)) updateFilter.locked = { $ne: true };
    const addResult = await Lounge.updateOne(updateFilter, {
      $push: {
        queue: {
          track: trackId,
          addedBy: req.user.id,
          votes: 0,
          position: lastPosition + 1000,
        },
      },
      $inc: { __v: 1 },
    });
    if (!addResult.modifiedCount) {
      return res.status(409).json({ success: false, message: 'Queue changed or is locked. Refresh and try again.' });
    }

    // Log the event
    await QueueEvent.create({
      lounge: lounge._id,
      user: req.user.id,
      type: 'trackAdded',
      payload: { trackId, trackTitle: track.title },
    });

    // Broadcast queue update
    const populatedLounge = await Lounge.findById(lounge._id)
      .populate('queue.track', 'title artist acoustic coverImageUrl durationSeconds');
    const queue = publicQueue(populatedLounge.queue);

    const io = req.app.get('io');
    io.to(lounge._id.toString()).emit('lounge:queue:update', {
      event: 'lounge.queue.update',
      loungeId: lounge._id,
      payload: { queue, reason: 'trackAdded' },
      ts: Date.now(),
    });

    res.status(200).json({ success: true, message: `"${track.title}" added to queue!`, queue });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/queue/:loungeId/vote
// @desc    Vote to upvote a track in the queue
// @access  Private
const voteForTrack = async (req, res, next) => {
  try {
    const { queueEntryId } = req.body;
    const lounge = await Lounge.findById(req.params.loungeId);

    if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });
    if (lounge.hostDisconnected) return res.status(423).json({ success: false, message: 'Queue controls are frozen until the host reconnects.' });
    if (lounge.locked && !canControlLounge(lounge, req.user)) {
      return res.status(403).json({ success: false, message: 'This lounge is locked.' });
    }

    const entry = lounge.queue.id(queueEntryId);
    if (!entry) return res.status(404).json({ success: false, message: 'Queue entry not found.' });
    if (entry.voters.some((voterId) => String(voterId) === String(req.user.id))) {
      return res.status(409).json({ success: false, message: 'You have already voted for this track.' });
    }

    const voteFilter = {
      _id: lounge._id,
      hostDisconnected: { $ne: true },
      queue: { $elemMatch: { _id: queueEntryId, voters: { $ne: req.user.id } } },
    };
    if (lounge.locked && !canControlLounge(lounge, req.user)) {
      voteFilter.locked = { $ne: true };
    }
    const updateResult = await Lounge.updateOne(
      voteFilter,
      {
        $addToSet: { 'queue.$.voters': req.user.id },
        $inc: { 'queue.$.votes': 1, __v: 1 },
      }
    );
    if (!updateResult.modifiedCount) {
      return res.status(409).json({ success: false, message: 'You have already voted for this track.' });
    }

    // Log the event
    await QueueEvent.create({
      lounge: lounge._id,
      user: req.user.id,
      type: 'vote',
      payload: { queueEntryId, trackId: entry.track },
      sentimentAtEvent: lounge.currentSentimentScore,
    });

    // Broadcast updated queue to all room participants
    const populatedLounge = await Lounge.findById(lounge._id)
      .populate('queue.track', 'title artist acoustic coverImageUrl durationSeconds');
    const sortedForBroadcast = publicQueue(populatedLounge.queue);

    const io = req.app.get('io');
    io.to(lounge._id.toString()).emit('lounge:queue:update', {
      event: 'lounge.queue.update',
      loungeId: lounge._id,
      payload: { queue: sortedForBroadcast, reason: 'vote' },
      ts: Date.now(),
    });

    res.status(200).json({
      success: true,
      message: 'Vote counted!',
      queue: sortedForBroadcast,
    });
  } catch (error) {
    next(error);
  }
};

// @route   DELETE /api/queue/:loungeId/:queueEntryId
// @desc    Remove own queued track, or any queued track as Host/Co-DJ
// @access  Private (must be in the lounge)
const removeTrackFromQueue = async (req, res, next) => {
  try {
    const lounge = await Lounge.findById(req.params.loungeId).populate('queue.track', 'title artist');
    if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });
    if (lounge.status === 'ended') return res.status(400).json({ success: false, message: 'Session has ended.' });
    if (lounge.hostDisconnected) return res.status(423).json({ success: false, message: 'Queue controls are frozen until the host reconnects.' });

    const queueEntry = lounge.queue.id(req.params.queueEntryId);
    if (!queueEntry) return res.status(404).json({ success: false, message: 'Queue entry not found.' });
    const canControl = canControlLounge(lounge, req.user);
    if (!canRemoveQueueEntry(lounge, queueEntry, req.user)) {
      return res.status(403).json({ success: false, message: 'Listeners can only remove tracks they added.' });
    }
    if (lounge.locked && !canControl) {
      return res.status(403).json({ success: false, message: 'This lounge is locked.' });
    }
    const removedTrack = queueEntry.track;
    const entryFilter = { _id: queueEntry._id };
    if (!canControl) entryFilter.addedBy = req.user.id;
    const updateResult = await Lounge.updateOne(
      {
        _id: lounge._id,
        __v: lounge.__v,
        status: { $ne: 'ended' },
        hostDisconnected: { $ne: true },
        ...(!canControl ? { locked: { $ne: true } } : {}),
        queue: { $elemMatch: entryFilter },
      },
      {
        $pull: { queue: { _id: queueEntry._id } },
        $inc: { __v: 1 },
      }
    );
    if (!updateResult.modifiedCount) {
      return res.status(409).json({ success: false, message: 'The queue changed before the track could be removed. Refresh and try again.' });
    }

    await QueueEvent.create({
      lounge: lounge._id,
      user: req.user.id,
      type: 'trackRemoved',
      payload: {
        queueEntryId: queueEntry._id,
        trackId: removedTrack?._id || queueEntry.track,
        trackTitle: removedTrack?.title || '',
      },
    });

    const updatedLounge = await Lounge.findById(lounge._id)
      .populate('queue.track', 'title artist acoustic coverImageUrl durationSeconds');
    const queue = publicQueue(updatedLounge.queue);
    req.app.get('io').to(lounge._id.toString()).emit('lounge:queue:update', {
      event: 'lounge.queue.update',
      loungeId: lounge._id,
      payload: { queue, reason: 'trackRemoved' },
      ts: Date.now(),
    });

    return res.status(200).json({
      success: true,
      message: removedTrack?.title ? `"${removedTrack.title}" removed from queue.` : 'Track removed from queue.',
      queue,
    });
  } catch (error) {
    return next(error);
  }
};

// @route   GET /api/queue/:loungeId
// @desc    Get the current queue for a lounge
// @access  Private
const getQueue = async (req, res, next) => {
  try {
    const lounge = await Lounge.findById(req.params.loungeId);

    if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });

    const uniqueEntries = uniqueQueue(lounge.queue, lounge.currentTrack);
    if (uniqueEntries.length !== lounge.queue.length) {
      lounge.queue = uniqueEntries;
      await lounge.save();
    }
    await lounge.populate([
      { path: 'queue.track', select: 'title artist album acoustic coverImageUrl audioAssetUrl durationSeconds' },
      { path: 'currentTrack', select: 'title artist album acoustic coverImageUrl audioAssetUrl durationSeconds' },
    ]);

    const sortedQueue = publicQueue(uniqueQueue(lounge.queue, lounge.currentTrack));
    const recentEvents = await QueueEvent.find({ lounge: lounge._id, type: { $in: ['trackPlaying', 'segueApproved'] } })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('payload.trackId');
    const currentTrackId = String(lounge.currentTrack?._id || lounge.currentTrack || '');
    const recentTrackIds = [...new Set(recentEvents
      .map((event) => String(event.payload?.trackId || event.payload?.toTrackId || ''))
      .filter((trackId) => trackId && trackId !== currentTrackId))];
    const recentTracks = await Track.find({ _id: { $in: recentTrackIds } })
      .select('title artist album acoustic coverImageUrl durationSeconds');
    const recentTrackById = new Map(recentTracks.map((track) => [String(track._id), track]));

    res.status(200).json({
      success: true,
      currentTrack: lounge.currentTrack,
      playback: lounge.playback,
      queue: sortedQueue,
      recentTracks: recentTrackIds.map((trackId) => recentTrackById.get(trackId)).filter(Boolean),
      sentiment: lounge.currentSentimentScore,
    });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/queue/:loungeId/next
// @desc    Advance to the next track - Host only
// @access  Private
const advanceToNextTrack = async (req, res, next) => {
  try {
    let advanced = null;
    for (let attempt = 0; attempt < 5 && !advanced; attempt += 1) {
      const lounge = await Lounge.findById(req.params.loungeId).populate('queue.track');
      if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });
      if (lounge.hostDisconnected) {
        return res.status(423).json({ success: false, message: 'Queue controls are frozen until the host reconnects.' });
      }
      if (!canControlLounge(lounge, req.user)) {
        return res.status(403).json({ success: false, message: 'Only a host or Co-DJ can advance the track.' });
      }

      const uniqueEntries = uniqueQueue(lounge.queue, lounge.currentTrack);
      const nextEntry = uniqueEntries[0];
      if (!nextEntry) return res.status(400).json({ success: false, message: 'Queue is empty.' });
      const previousTrack = lounge.currentTrack;
      const remainingEntries = uniqueEntries
        .filter((entry) => String(entry._id) !== String(nextEntry._id))
        .map((entry) => entry.toObject());
      const updateResult = await Lounge.updateOne(
        { _id: lounge._id, __v: lounge.__v, status: { $ne: 'ended' }, hostDisconnected: { $ne: true } },
        {
          $set: {
            currentTrack: nextEntry.track._id || nextEntry.track,
            queue: remainingEntries,
            status: 'live',
            playback: {
              isPlaying: Boolean(lounge.playback?.isPlaying),
              positionSeconds: 0,
              updatedAt: new Date(),
            },
          },
          $inc: { __v: 1 },
        }
      );
      if (updateResult.modifiedCount) {
        advanced = {
          loungeId: lounge._id,
          nextTrack: nextEntry.track,
          previousTrack,
          playback: {
            isPlaying: Boolean(lounge.playback?.isPlaying),
            positionSeconds: 0,
            updatedAt: new Date(),
          },
        };
      }
    }
    if (!advanced) {
      return res.status(409).json({ success: false, message: 'Queue changed repeatedly while advancing. Please try again.' });
    }

    const updatedLounge = await Lounge.findById(advanced.loungeId)
      .populate('queue.track', 'title artist acoustic coverImageUrl durationSeconds');
    const remainingQueue = publicQueue(updatedLounge.queue);

    // Log the event
    await QueueEvent.create({
      lounge: updatedLounge._id,
      user: req.user.id,
      type: 'trackPlaying',
      payload: { trackId: advanced.nextTrack._id, previousTrackId: advanced.previousTrack },
    });

    // Broadcast
    const io = req.app.get('io');
    io.to(updatedLounge._id.toString()).emit('lounge:nowplaying:update', {
      event: 'lounge.nowplaying.update',
      loungeId: updatedLounge._id,
      payload: {
        currentTrack: advanced.nextTrack,
        playback: advanced.playback,
        queue: remainingQueue,
        reason: 'manual_advance',
      },
      ts: Date.now(),
    });

    res.status(200).json({
      success: true,
      message: 'Advanced to next track!',
      currentTrack: advanced.nextTrack,
      remainingQueue,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { addTrackToQueue, voteForTrack, removeTrackFromQueue, getQueue, advanceToNextTrack };
