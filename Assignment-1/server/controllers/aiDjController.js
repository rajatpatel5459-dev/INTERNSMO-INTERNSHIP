// controllers/aiDjController.js - AI DJ segue selection and Q&A

const Lounge = require('../models/Lounge');
const Track = require('../models/Track');
const ChatMessage = require('../models/ChatMessage');
const QueueEvent = require('../models/QueueEvent');
const { pickBestSegue, checkCompatibility } = require('../services/acousticMatcher');
const { sortQueue } = require('../services/queueEngine');
const { generateTransitionBanter, answerTrackQuestion } = require('../services/aiDjEngine');

// @route   POST /api/aidj/:loungeId/segue
// @desc    Ask AI DJ to select the next track from the queue
// @access  Private (host or admin)
const getAiSegue = async (req, res, next) => {
  try {
    const lounge = await Lounge.findById(req.params.loungeId)
      .populate('currentTrack')
      .populate('queue.track');

    if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });

    if (!lounge.currentTrack) {
      return res.status(400).json({ success: false, message: 'No track is currently playing.' });
    }

    if (lounge.queue.length === 0) {
      return res.status(400).json({ success: false, message: 'Queue is empty. Add some tracks first.' });
    }

    // Get candidate tracks from the queue
    const candidateTracks = lounge.queue
      .filter((entry) => entry.track) // Filter out invalid entries
      .map((entry) => entry.track);

    // Use acoustic matcher to find the best compatible next track
    const recentEvents = await QueueEvent.find({
      lounge: lounge._id,
      type: 'trackPlaying',
    }).sort({ createdAt: -1 }).limit(10).select('payload.trackId');
    const recentlyPlayedIds = recentEvents.map((event) => String(event.payload.trackId));

    const bestTrack = pickBestSegue(
      lounge.currentTrack,
      candidateTracks,
      lounge.currentSentimentScore,
      lounge.settings.bpmTolerancePct,
      recentlyPlayedIds
    );

    if (!bestTrack) {
      const message = 'No compatible track found in queue. All candidates clash acoustically.';
      req.app.get('io').to(lounge._id.toString()).emit('lounge:ai:segue_suggestion', {
        event: 'lounge.ai.segue_suggestion',
        loungeId: lounge._id,
        payload: {
          selectedTrack: null,
          matchReason: null,
          message,
          fromTrackId: lounge.currentTrack._id,
        },
        ts: Date.now(),
      });
      return res.status(200).json({
        success: true,
        message,
        selectedTrack: null,
        matchReason: null,
        transitionScript: null,
      });
    }

    // Generate the compatibility details for the match
    const compatibility = checkCompatibility(
      lounge.currentTrack,
      bestTrack,
      lounge.settings.bpmTolerancePct
    );

    // Generate transition banter from AI DJ
    const transitionScript = await generateTransitionBanter(
      lounge.currentTrack,
      bestTrack,
      lounge.currentSentimentScore
    );

    // Log the segue decision as an event
    await QueueEvent.create({
      lounge: lounge._id,
      user: null, // AI DJ action
      type: 'segue',
      payload: {
        fromTrackId: lounge.currentTrack._id,
        toTrackId: bestTrack._id,
        reason: compatibility.reason,
        transitionScript,
        sentimentScore: lounge.currentSentimentScore,
      },
    });

    // Save the AI DJ announcement as a chat message so all clients see it
    const announcement = await ChatMessage.create({
      lounge: lounge._id,
      user: null,
      msgType: 'dj_announcement',
      body: transitionScript,
    });

    // Broadcast the AI DJ announcement
    const io = req.app.get('io');
    io.to(lounge._id.toString()).emit('lounge:ai:segue_suggestion', {
      event: 'lounge.ai.segue_suggestion',
      loungeId: lounge._id,
      payload: {
        selectedTrack: bestTrack,
        matchReason: compatibility.reason,
        message: '',
        fromTrackId: lounge.currentTrack._id,
      },
      ts: Date.now(),
    });
    io.to(lounge._id.toString()).emit('lounge:ai:dj_announcement', {
      event: 'lounge.ai.dj_announcement',
      loungeId: lounge._id,
      payload: {
        text: transitionScript,
        relatedTrackId: bestTrack._id,
        fromTrackId: lounge.currentTrack._id,
        matchReason: compatibility.reason,
      },
      ts: Date.now(),
    });

    res.status(200).json({
      success: true,
      selectedTrack: bestTrack,
      matchReason: {
        description: compatibility.reason,
        bpmCurrent: lounge.currentTrack.acoustic.bpm,
        bpmNext: bestTrack.acoustic.bpm,
        keyCurrent: lounge.currentTrack.acoustic.camelotKey,
        keyNext: bestTrack.acoustic.camelotKey,
      },
      transitionScript,
      sources: (bestTrack.timeline || []).slice(0, 1).map((entry) => ({
        ts: entry.ts,
        type: entry.type,
        text: entry.text,
      })),
      sentimentInfluence: lounge.currentSentimentScore,
    });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/aidj/:loungeId/ask
// @desc    Ask the AI DJ a question about the current track
// @access  Private
const askAiDj = async (req, res, next) => {
  try {
    const question = typeof req.body.question === 'string' ? req.body.question.trim() : '';
    const requestedTrackId = req.body.trackId;

    if (!question) {
      return res.status(400).json({ success: false, message: 'Please provide a question.' });
    }

    const lounge = await Lounge.findById(req.params.loungeId).populate('currentTrack');

    if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });
    let questionTrack = lounge.currentTrack;
    if (requestedTrackId && String(questionTrack?._id || '') !== String(requestedTrackId)) {
      const recentEvents = await QueueEvent.find({ lounge: lounge._id, type: { $in: ['trackPlaying', 'segueApproved'] } })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('payload.trackId');
      const isRecentlyPlayed = recentEvents.some(
        (event) => String(event.payload?.trackId || event.payload?.toTrackId || '') === String(requestedTrackId)
      );
      if (!isRecentlyPlayed) {
        return res.status(400).json({
          success: false,
          message: 'Choose the current track or one of the lounge’s recently played tracks.',
        });
      }
      questionTrack = await Track.findById(requestedTrackId);
      if (!questionTrack) return res.status(404).json({ success: false, message: 'Track not found.' });
    }

    // Get the AI DJ answer (grounded in track metadata)
    const { answer, sources } = await answerTrackQuestion(question, questionTrack);

    // Save the Q&A as a chat message
    await ChatMessage.create({
      lounge: lounge._id,
      user: null, // AI DJ response
      msgType: 'ai_answer',
      body: answer,
      replyTo: question,
    });
    await QueueEvent.create({
      lounge: lounge._id,
      user: req.user.id,
      type: 'aiQuestion',
      payload: { question, trackId: questionTrack?._id, sources },
    });

    // Broadcast to all room participants
    const io = req.app.get('io');
    io.to(lounge._id.toString()).emit('lounge:ai:qa', {
      event: 'lounge.ai.qa',
      loungeId: lounge._id,
      payload: {
        question,
        answer,
        sources,
        track: questionTrack ? { id: questionTrack._id, title: questionTrack.title, artist: questionTrack.artist } : null,
        askedBy: { id: req.user.id, displayName: req.user.displayName },
      },
      ts: Date.now(),
    });

    res.status(200).json({
      success: true,
      question,
      answer,
      sources, // Shows which metadata was used - for transparency
      track: questionTrack
        ? { id: questionTrack._id, title: questionTrack.title, artist: questionTrack.artist }
        : null,
    });
  } catch (error) {
    next(error);
  }
};

const askTrackQuestion = async (req, res, next) => {
  try {
    const question = typeof req.body.question === 'string' ? req.body.question.trim() : '';
    if (!question) {
      return res.status(400).json({ success: false, message: 'Please provide a question.' });
    }

    const track = await Track.findById(req.params.trackId);
    if (!track) return res.status(404).json({ success: false, message: 'Track not found.' });

    const { answer, sources } = await answerTrackQuestion(question, track);
    res.status(200).json({
      success: true,
      question,
      answer,
      sources,
      track: { id: track._id, title: track.title, artist: track.artist },
    });
  } catch (error) {
    next(error);
  }
};

const applyAiSegue = async (req, res, next) => {
  try {
    const { trackId } = req.body;
    if (!trackId) return res.status(400).json({ success: false, message: 'trackId is required.' });

    const lounge = await Lounge.findById(req.params.loungeId)
      .populate('currentTrack')
      .populate('queue.track');
    if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });
    if (!lounge.currentTrack) return res.status(400).json({ success: false, message: 'No track is currently playing.' });

    const queueEntry = lounge.queue.find((entry) => String(entry.track?._id || entry.track) === String(trackId));
    if (!queueEntry) return res.status(404).json({ success: false, message: 'The suggested track is no longer in the queue.' });
    const compatibility = checkCompatibility(
      lounge.currentTrack,
      queueEntry.track,
      lounge.settings.bpmTolerancePct
    );
    if (!compatibility.compatible) {
      return res.status(400).json({ success: false, message: `This track cannot be applied as an AI segue: ${compatibility.reason}` });
    }

    const previousTrack = lounge.currentTrack;
    lounge.currentTrack = queueEntry.track._id || queueEntry.track;
    lounge.queue.pull(queueEntry._id);
    lounge.status = 'live';
    lounge.playback = {
      isPlaying: Boolean(lounge.playback?.isPlaying),
      positionSeconds: 0,
      updatedAt: new Date(),
    };
    await lounge.save();

    await QueueEvent.create({
      lounge: lounge._id,
      user: req.user.id,
      type: 'segueApproved',
      payload: {
        fromTrackId: previousTrack._id,
        toTrackId: lounge.currentTrack,
        reason: compatibility.reason,
      },
    });

    const queue = sortQueue(lounge.queue).map((entry) => {
      const result = entry.toObject ? entry.toObject() : { ...entry };
      delete result.voters;
      return result;
    });
    const io = req.app.get('io');
    io.to(lounge._id.toString()).emit('lounge:nowplaying:update', {
      event: 'lounge.nowplaying.update',
      loungeId: lounge._id,
      payload: {
        currentTrack: queueEntry.track,
        playback: lounge.playback,
        queue,
        reason: 'ai_segue_approved',
      },
      ts: Date.now(),
    });

    res.status(200).json({
      success: true,
      currentTrack: queueEntry.track,
      remainingQueue: queue,
      matchReason: compatibility.reason,
    });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/aidj/:loungeId/compatible
// @desc    Get all compatible tracks from the queue for the current track
// @access  Private
const getCompatibleTracks = async (req, res, next) => {
  try {
    const lounge = await Lounge.findById(req.params.loungeId)
      .populate('currentTrack')
      .populate('queue.track');

    if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });
    if (!lounge.currentTrack) {
      return res.status(400).json({ success: false, message: 'No track is currently playing.' });
    }

    // Check each queue track for compatibility
    const results = lounge.queue
      .filter((entry) => entry.track)
      .map((entry) => {
        const compatibility = checkCompatibility(
          lounge.currentTrack,
          entry.track,
          lounge.settings.bpmTolerancePct
        );
        return {
          track: {
            id: entry.track._id,
            title: entry.track.title,
            artist: entry.track.artist,
            bpm: entry.track.acoustic.bpm,
            camelotKey: entry.track.acoustic.camelotKey,
          },
          votes: entry.votes,
          compatible: compatibility.compatible,
          reason: compatibility.reason,
        };
      });

    res.status(200).json({
      success: true,
      currentTrack: {
        title: lounge.currentTrack.title,
        artist: lounge.currentTrack.artist,
        bpm: lounge.currentTrack.acoustic.bpm,
        camelotKey: lounge.currentTrack.acoustic.camelotKey,
      },
      queueCompatibility: results,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAiSegue, askAiDj, askTrackQuestion, getCompatibleTracks, applyAiSegue };
