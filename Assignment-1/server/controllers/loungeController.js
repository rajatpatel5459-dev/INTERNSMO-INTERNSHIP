// controllers/loungeController.js - Create, join, and manage DJ Lounges

const Lounge = require('../models/Lounge');
const Track = require('../models/Track');
const QueueEvent = require('../models/QueueEvent');
const Interaction = require('../models/Interaction');
const User = require('../models/User');
const { canControlLounge, canCreateLounge, isLoungeHost, toId } = require('../services/accessPolicy');
const { connectedParticipants } = require('../services/loungePresence');

const VALID_VIBES = ['High-Energy EDM', 'Lo-Fi Chill', 'Hip-Hop', 'Pop Hits', 'Acoustic', 'Mixed'];
const VALID_AI_VERBOSITY = ['quiet', 'normal', 'verbose'];

// @route   POST /api/lounges
// @desc    Create a new DJ Lounge
// @access  Private
const createLounge = async (req, res, next) => {
  try {
    const { name, seedTrackId, vibeProfile, maxParticipants, bpmTolerancePct, aiOutroWindowSeconds, soundclashEnabled, aiVerbosity } = req.body;

    if (!canCreateLounge(req.user)) {
      return res.status(403).json({ success: false, message: 'Host or Admin access is required to create a lounge.' });
    }
    if (!name) {
      return res.status(400).json({ success: false, message: 'Lounge name is required.' });
    }
    if (vibeProfile && !VALID_VIBES.includes(vibeProfile)) {
      return res.status(400).json({
        success: false,
        message: `Invalid vibeProfile. Choose one of: ${VALID_VIBES.join(', ')}.`,
      });
    }
    if (aiVerbosity && !VALID_AI_VERBOSITY.includes(aiVerbosity)) {
      return res.status(400).json({
        success: false,
        message: `Invalid settings.aiVerbosity. Choose one of: ${VALID_AI_VERBOSITY.join(', ')}.`,
      });
    }
    if (aiOutroWindowSeconds !== undefined &&
      (!Number.isInteger(aiOutroWindowSeconds) || aiOutroWindowSeconds < 5 || aiOutroWindowSeconds > 30)) {
      return res.status(400).json({
        success: false,
        message: 'AI outro window must be a whole number between 5 and 30 seconds.',
      });
    }

    // Build the lounge object
    const loungeData = {
      name,
      host: req.user.id,
      vibeProfile: vibeProfile || 'Mixed',
      participants: [req.user.id], // Host joins automatically
      settings: {
        maxParticipants: maxParticipants || 50,
        bpmTolerancePct: bpmTolerancePct || 8,
        aiOutroWindowSeconds: aiOutroWindowSeconds ?? 5,
        soundclashEnabled: soundclashEnabled !== undefined ? soundclashEnabled : true,
        aiVerbosity: aiVerbosity || 'normal',
      },
    };

    // If a seed track is provided, add it as the first queue item
    if (seedTrackId) {
      const track = await Track.findById(seedTrackId);
      if (!track) {
        return res.status(404).json({ success: false, message: 'Seed track not found.' });
      }
      loungeData.currentTrack = seedTrackId;
      loungeData.status = 'live';
      loungeData.startedAt = new Date();
    }

    const lounge = await Lounge.create(loungeData);

    // Log the creation event
    await QueueEvent.create({
      lounge: lounge._id,
      user: req.user.id,
      type: 'userJoined',
      payload: { action: 'created_lounge', name: lounge.name },
    });

    res.status(201).json({
      success: true,
      message: 'DJ Lounge created!',
      lounge: {
        id: lounge._id,
        name: lounge.name,
        inviteCode: lounge.inviteCode,
        status: lounge.status,
        hostId: lounge.host,
        vibeProfile: lounge.vibeProfile,
        settings: lounge.settings,
        createdAt: lounge.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/lounges/join
// @desc    Join a lounge using an invite code
// @access  Private
const joinLounge = async (req, res, next) => {
  try {
    const { inviteCode } = req.body;

    if (!inviteCode) {
      return res.status(400).json({ success: false, message: 'Please provide an invite code.' });
    }

    const lounge = await Lounge.findOne({ inviteCode: inviteCode.toUpperCase() })
      .populate('currentTrack')
      .populate('queue.track')
      .populate('participants', 'displayName');

    if (!lounge) {
      return res.status(404).json({ success: false, message: 'Lounge not found. Check the invite code.' });
    }

    if (lounge.status === 'ended') {
      return res.status(400).json({ success: false, message: 'This lounge session has ended.' });
    }
    if (lounge.locked && !canControlLounge(lounge, req.user)) {
      return res.status(403).json({ success: false, message: 'This lounge is locked.' });
    }
    if ((lounge.bannedParticipants || []).some((personId) => toId(personId) === String(req.user.id))) {
      return res.status(403).json({ success: false, message: 'You are not allowed to rejoin this lounge.' });
    }

    const io = req.app.get('io');
    const connectedSockets = await io.in(lounge._id.toString()).fetchSockets();
    const connectedUsers = new Map(
      connectedSockets.map((socket) => [
        socket.data.userId,
        { _id: socket.data.userId, displayName: socket.data.displayName },
      ])
    );

    // Add user if not already in the room
    const alreadyIn = lounge.participants.some((p) => p._id.toString() === req.user.id);
    if (!alreadyIn) {
      if (connectedUsers.size >= lounge.settings.maxParticipants) {
        return res.status(400).json({ success: false, message: 'This lounge is full.' });
      }

      lounge.participants.push(req.user.id);
      await lounge.save();

    }
    connectedUsers.set(String(req.user.id), {
      _id: req.user.id,
      displayName: req.user.displayName,
    });

    res.status(200).json({
      success: true,
      message: `Joined lounge "${lounge.name}"!`,
      lounge: {
        id: lounge._id,
        name: lounge.name,
        status: lounge.status,
        vibeProfile: lounge.vibeProfile,
        currentTrack: lounge.currentTrack,
        queue: lounge.queue,
        soundclash: lounge.soundclash,
        participants: [...connectedUsers.values()],
        participantCount: connectedUsers.size,
        hostDisconnected: lounge.hostDisconnected,
        currentSentimentScore: lounge.currentSentimentScore,
        settings: lounge.settings,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/lounges
// @desc    Get all active (live) lounges
// @access  Private
const getActiveLounges = async (req, res, next) => {
  try {
    const lounges = await Lounge.find({ status: 'live' })
      .populate('host', 'displayName')
      .populate('currentTrack', 'title artist coverImageUrl')
      .select('-queue -soundclash.candidates.voters');

    res.status(200).json({
      success: true,
      count: lounges.length,
      lounges,
    });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/lounges/:id
// @desc    Get a single lounge's full state (for reconnect / initial sync)
// @access  Private
const getLoungeById = async (req, res, next) => {
  try {
    const lounge = await Lounge.findById(req.params.id)
      .populate('host', 'displayName')
      .populate('currentTrack')
      .populate('queue.track', 'title artist acoustic coverImageUrl durationSeconds')
      .populate('participants', 'displayName')
      .populate('coDjs', 'displayName')
      .populate('soundclash.candidates.track', 'title artist album genre coverImageUrl durationSeconds acoustic');

    if (!lounge) {
      return res.status(404).json({ success: false, message: 'Lounge not found.' });
    }

    const result = lounge.toObject();
    const connectedSockets = await req.app.get('io').in(lounge._id.toString()).fetchSockets();
    result.participants = connectedParticipants(connectedSockets);
    result.participantCount = result.participants.length;
    result.soundclash.candidates = result.soundclash.candidates.map((candidate) => {
      delete candidate.voters;
      return candidate;
    });
    res.status(200).json({ success: true, lounge: result });
  } catch (error) {
    next(error);
  }
};

// @route   PUT /api/lounges/:id/status
// @desc    Update lounge status (start/end a session) - Host only
// @access  Private
const updateLoungeStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const lounge = await Lounge.findById(req.params.id);

    if (!lounge) {
      return res.status(404).json({ success: false, message: 'Lounge not found.' });
    }

    // Only the host can change status
    if (!isLoungeHost(lounge, req.user)) {
      return res.status(403).json({ success: false, message: 'Host or Admin access is required to change lounge status.' });
    }
    if (lounge.status === 'ended' && status !== 'ended') {
      return res.status(400).json({ success: false, message: 'An ended lounge cannot be restarted.' });
    }
    if (lounge.status === 'live' && status === 'scheduled') {
      return res.status(400).json({ success: false, message: 'A live lounge cannot return to scheduled status.' });
    }
    if (!['scheduled', 'live', 'ended'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be scheduled, live, or ended.' });
    }

    if (status === 'live' && lounge.status !== 'live') {
      lounge.startedAt = new Date();
      lounge.endedAt = null;
    }
    lounge.status = status;
    if (status === 'ended' && !lounge.endedAt) {
      lounge.endedAt = new Date();
    }

    await lounge.save();

    // Broadcast status change
    const io = req.app.get('io');
    io.to(lounge._id.toString()).emit('lounge:status:update', {
      event: 'lounge.status.update',
      loungeId: lounge._id,
      payload: { status: lounge.status, endedAt: lounge.endedAt },
      ts: Date.now(),
    });

    res.status(200).json({ success: true, message: `Lounge status updated to "${status}".`, lounge });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/lounges/my
// @desc    Get the current user's lounge history
// @access  Private
const getMyLoungeHistory = async (req, res, next) => {
  try {
    // Find lounges where the user was a participant or host
    const lounges = await Lounge.find({
      $or: [{ host: req.user.id }, { participants: req.user.id }],
    })
      .populate('host', 'displayName')
      .populate('currentTrack', 'title artist coverImageUrl')
      .sort({ createdAt: -1 }) // Newest first
      .limit(20);

    res.status(200).json({ success: true, count: lounges.length, lounges });
  } catch (error) {
    next(error);
  }
};

const moderateLounge = async (req, res, next) => {
  try {
    const lounge = await Lounge.findById(req.params.id);
    if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });
    if (!Array.isArray(lounge.coDjs)) lounge.coDjs = [];
    if (!isLoungeHost(lounge, req.user)) {
      return res.status(403).json({ success: false, message: 'Host or Admin access is required for moderation.' });
    }

    const { action, participantId, muted, enabled, locked } = req.body;
    const targetId = String(participantId || '');
    const targetIsHost = toId(lounge.host) === targetId;
    const isParticipant = lounge.participants.some((id) => toId(id) === targetId);

    if (action === 'lock') {
      if (typeof locked !== 'boolean') {
        return res.status(400).json({ success: false, message: 'Provide a boolean locked value.' });
      }
      lounge.locked = locked;
    } else if (action === 'mute') {
      if (!participantId || !isParticipant || targetIsHost || typeof muted !== 'boolean') {
        return res.status(400).json({ success: false, message: 'Choose a room participant and provide a boolean muted value.' });
      }
      const alreadyMuted = lounge.mutedParticipants.some((id) => toId(id) === targetId);
      if (muted && !alreadyMuted) lounge.mutedParticipants.push(participantId);
      if (!muted && alreadyMuted) lounge.mutedParticipants.pull(participantId);
    } else if (action === 'remove') {
      if (!participantId || !isParticipant || targetIsHost) {
        return res.status(400).json({ success: false, message: 'Choose a room participant other than the host.' });
      }
      lounge.participants.pull(participantId);
      lounge.coDjs.pull(participantId);
      lounge.mutedParticipants.pull(participantId);
      lounge.bannedParticipants.addToSet(participantId);
      await QueueEvent.create({
        lounge: lounge._id,
        user: req.user.id,
        type: 'userLeft',
        payload: { participantId, reason: 'moderated' },
      });
    } else if (action === 'transfer') {
      if (!participantId || !isParticipant || targetIsHost) {
        return res.status(400).json({ success: false, message: 'Choose a room participant other than the current host.' });
      }
      const targetUser = await User.findById(participantId).select('role');
      if (!targetUser || !['host', 'admin'].includes(targetUser.role)) {
        return res.status(400).json({ success: false, message: 'Host transfer is only available to another Host or Admin account.' });
      }
      const oldHost = toId(lounge.host);
      lounge.host = participantId;
      lounge.coDjs.addToSet(oldHost);
      lounge.coDjs.pull(participantId);
    } else if (action === 'set-co-dj') {
      if (!participantId || !isParticipant || targetIsHost || typeof enabled !== 'boolean') {
        return res.status(400).json({ success: false, message: 'Choose a room participant and provide a boolean enabled value.' });
      }
      const isCoDj = lounge.coDjs.some((id) => toId(id) === targetId);
      if (enabled && !isCoDj) lounge.coDjs.addToSet(participantId);
      if (!enabled && isCoDj) lounge.coDjs.pull(participantId);
    } else {
      return res.status(400).json({ success: false, message: 'Unsupported moderation action.' });
    }

    await lounge.save();
    const io = req.app.get('io');
    const roomId = lounge._id.toString();
    if (action === 'remove') {
      const currentSockets = await io.in(roomId).fetchSockets();
      await Promise.all(currentSockets
        .filter((socket) => socket.data.userId === targetId)
        .map((socket) => socket.leave(roomId)));
    }
    const connectedSockets = await io.in(roomId).fetchSockets();
    const participants = connectedParticipants(connectedSockets);
    const payload = {
      action,
      participantId: targetId || null,
      muted: action === 'mute' ? muted : undefined,
      locked: action === 'lock' ? locked : lounge.locked,
      hostId: toId(lounge.host),
      coDjIds: lounge.coDjs.map(toId),
      participants,
      participantCount: participants.length,
    };
    io.to(roomId).emit('lounge:moderation:update', {
      event: 'lounge.moderation.update',
      loungeId: lounge._id,
      payload,
      ts: Date.now(),
    });

    res.status(200).json({ success: true, moderation: payload });
  } catch (error) {
    next(error);
  }
};

const leaveLounge = async (req, res, next) => {
  try {
    const lounge = await Lounge.findById(req.params.id);
    if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });
    if (toId(lounge.host) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: 'Transfer host role before leaving the lounge.' });
    }
    lounge.participants.pull(req.user.id);
    lounge.coDjs.pull(req.user.id);
    lounge.mutedParticipants.pull(req.user.id);
    await lounge.save();
    await QueueEvent.create({
      lounge: lounge._id,
      user: req.user.id,
      type: 'userLeft',
      payload: { displayName: req.user.displayName, reason: 'left' },
    });
    const io = req.app.get('io');
    const roomId = lounge._id.toString();
    const userSockets = await io.in(roomId).fetchSockets();
    await Promise.all(userSockets
      .filter((socket) => socket.data.userId === String(req.user.id))
      .map((socket) => socket.leave(roomId)));
    const remainingSockets = await io.in(roomId).fetchSockets();
    const participants = connectedParticipants(remainingSockets);
    io.to(lounge._id.toString()).emit('lounge:presence:update', {
      event: 'lounge.presence.update',
      loungeId: lounge._id,
      payload: {
        userId: req.user.id,
        displayName: req.user.displayName,
        action: 'left',
        participants,
        participantCount: participants.length,
        hostDisconnected: lounge.hostDisconnected,
      },
      ts: Date.now(),
    });
    res.status(200).json({ success: true, message: 'You left the lounge.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createLounge,
  joinLounge,
  getActiveLounges,
  getLoungeById,
  updateLoungeStatus,
  getMyLoungeHistory,
  moderateLounge,
  leaveLounge,
};
