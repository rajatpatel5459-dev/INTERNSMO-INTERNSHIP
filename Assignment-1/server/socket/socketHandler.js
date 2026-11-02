// socket/socketHandler.js
// Handles all real-time WebSocket connections using Socket.io
// Each DJ Lounge gets its own Socket.io "room" identified by the loungeId

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Lounge = require('../models/Lounge');
const QueueEvent = require('../models/QueueEvent');
const { isLoungeMember, canControlLounge, isLoungeHost, toId } = require('../services/accessPolicy');
const {
  connectedParticipants,
  isUnexpectedDisconnect,
} = require('../services/loungePresence');

// Track typing indicators per lounge: { loungeId: { userId: displayName } }
const typingUsers = {};

async function publishDeparture(io, loungeId, socket, action, markHostDisconnected = false) {
  const sockets = await io.in(loungeId).fetchSockets();
  const userStillConnected = sockets.some((connectedSocket) => (
    connectedSocket.data.userId === toId(socket.user)
  ));
  if (userStillConnected) return;

  const lounge = await Lounge.findById(loungeId)
    .select('host hostDisconnected participants coDjs');
  if (!lounge || !isLoungeMember(lounge, socket.user)) return;
  const isHost = lounge && toId(lounge.host) === toId(socket.user);
  try {
    await QueueEvent.create({
      lounge: loungeId,
      user: socket.user._id,
      type: 'userLeft',
      payload: { displayName: socket.user.displayName, reason: action },
    });
  } catch (error) {
    console.error('Could not record lounge departure:', error.message);
  }
  if (isHost && markHostDisconnected && !lounge.hostDisconnected) {
    lounge.hostDisconnected = true;
    await lounge.save();
  }

  const participants = connectedParticipants(sockets);
  io.to(loungeId).emit('lounge:presence:update', {
    event: 'lounge.presence.update',
    loungeId,
    payload: {
      userId: socket.user._id,
      displayName: socket.user.displayName,
      action,
      participants,
      participantCount: participants.length,
      hostDisconnected: lounge?.hostDisconnected || false,
    },
    ts: Date.now(),
  });
}

const socketHandler = (io) => {
  // --- Authenticate every socket connection at handshake time ---
  io.use(async (socket, next) => {
    try {
      // The client must send the JWT token when connecting
      // e.g., io({ auth: { token: 'Bearer <jwt>' } })
      const token = socket.handshake.auth?.token?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication error: No token provided.'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-passwordHash');

      if (!user) {
        return next(new Error('Authentication error: User not found.'));
      }

      // Attach user info to the socket for use in event handlers
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token.'));
    }
  });

  // --- Handle client connections ---
  io.on('connection', (socket) => {
    socket.data.userId = toId(socket.user);
    socket.data.displayName = socket.user.displayName;
    socket.data.role = socket.user.role;
    console.log(`🔌 Socket connected: ${socket.user.displayName} (${socket.id})`);

    // === JOIN A LOUNGE ROOM ===
    // Client sends: { loungeId: '...' }
    socket.on('lounge:join', async ({ loungeId }) => {
      try {
        const lounge = await Lounge.findById(loungeId);
        if (!lounge) {
          socket.emit('error', { message: 'Lounge not found.' });
          return;
        }
        if (!isLoungeMember(lounge, socket.user)) {
          socket.emit('error', { message: 'Join this lounge before connecting to its live channel.' });
          return;
        }
        if (lounge.status === 'ended') {
          socket.emit('error', { message: 'This lounge session has ended.' });
          return;
        }
        if ((lounge.bannedParticipants || []).some((userId) => toId(userId) === toId(socket.user))) {
          socket.emit('error', { message: 'You are not allowed to rejoin this lounge.' });
          return;
        }
        if (lounge.locked && !canControlLounge(lounge, socket.user)) {
          socket.emit('error', { message: 'This lounge is locked.' });
          return;
        }
        if (socket.currentLoungeId && socket.currentLoungeId !== loungeId) {
          const previousLoungeId = socket.currentLoungeId;
          await socket.leave(previousLoungeId);
          socket.currentLoungeId = null;
          await publishDeparture(io, previousLoungeId, socket, 'left');
        }

        const existingSockets = await io.in(loungeId).fetchSockets();
        const userAlreadyConnected = existingSockets.some((connectedSocket) => (
          connectedSocket.data.userId === toId(socket.user)
        ));
        // Join the Socket.io room for this lounge
        await socket.join(loungeId);
        socket.currentLoungeId = loungeId; // Track which lounge this socket is in
        if (toId(lounge.host) === toId(socket.user) && lounge.hostDisconnected) {
          lounge.hostDisconnected = false;
          await lounge.save();
        }

        console.log(`  → ${socket.user.displayName} joined room: ${loungeId}`);

        // Send the full current lounge state to the newly joined client
        const fullLounge = await Lounge.findById(loungeId)
          .populate('currentTrack')
          .populate('queue.track', 'title artist acoustic coverImageUrl durationSeconds')
          .populate('soundclash.candidates.track', 'title artist album genre coverImageUrl durationSeconds acoustic')
          .populate('participants', 'displayName');
        const joinedSockets = await io.in(loungeId).fetchSockets();
        const participants = connectedParticipants(joinedSockets);
        const safeQueue = fullLounge.queue
          .sort((a, b) => (b.votes || 0) - (a.votes || 0) || a.position - b.position)
          .map((entry) => {
            const result = entry.toObject();
            delete result.voters;
            return result;
          });
        const safeCandidates = fullLounge.soundclash.candidates.map((candidate) => {
          const result = candidate.toObject();
          delete result.voters;
          return result;
        });
        if (!userAlreadyConnected) {
          try {
            await QueueEvent.create({
              lounge: loungeId,
              user: socket.user._id,
              type: 'userJoined',
              payload: { displayName: socket.user.displayName, reason: 'connected' },
              sentimentAtEvent: fullLounge.currentSentimentScore,
            });
          } catch (error) {
            console.error('Could not record lounge connection:', error.message);
          }
        }

        socket.emit('lounge:sync', {
          event: 'lounge.sync',
          loungeId,
          payload: {
            currentTrack: fullLounge.currentTrack,
            playback: fullLounge.playback,
            queue: safeQueue,
            soundclash: {
              active: fullLounge.soundclash.active,
              candidates: safeCandidates,
              hasVoted: fullLounge.soundclash.candidates.some((candidate) =>
                candidate.voters.some((voterId) => toId(voterId) === toId(socket.user))
              ),
              votedTrackId: fullLounge.soundclash.candidates.find((candidate) =>
                candidate.voters.some((voterId) => toId(voterId) === toId(socket.user))
              )?.track?._id || fullLounge.soundclash.candidates.find((candidate) =>
                candidate.voters.some((voterId) => toId(voterId) === toId(socket.user))
              )?.track || null,
              closesAt: fullLounge.soundclash.closesAt,
            },
            participantCount: participants.length,
            participants,
            sentimentScore: fullLounge.currentSentimentScore,
            status: fullLounge.status,
            hostDisconnected: fullLounge.hostDisconnected,
          },
          ts: Date.now(),
        });
        io.to(loungeId).emit('lounge:presence:update', {
          event: 'lounge.presence.update',
          loungeId,
          payload: {
            userId: socket.user._id,
            displayName: socket.user.displayName,
            action: 'joined',
            participants,
            participantCount: participants.length,
            hostDisconnected: fullLounge.hostDisconnected,
          },
          ts: Date.now(),
        });
      } catch (error) {
        console.error('lounge:join error:', error.message);
        socket.emit('error', { message: 'Could not join lounge.' });
      }
    });

    socket.on('lounge:playback:control', async ({ loungeId, action, positionSeconds } = {}) => {
      try {
        if (!loungeId || socket.currentLoungeId !== loungeId) return;
        const lounge = await Lounge.findById(loungeId);
        if (!lounge || !isLoungeMember(lounge, socket.user)) {
          socket.emit('error', { message: 'Join this lounge before controlling playback.' });
          return;
        }
        if (!isLoungeHost(lounge, socket.user)) {
          socket.emit('error', { message: 'Only the Host can control room playback.' });
          return;
        }
        if (!['play', 'pause', 'position'].includes(action)) {
          socket.emit('error', { message: 'Unsupported playback action.' });
          return;
        }
        if (!lounge.currentTrack) {
          socket.emit('error', { message: 'Choose a track before starting playback.' });
          return;
        }
        if (!Number.isFinite(positionSeconds) || positionSeconds < 0) {
          socket.emit('error', { message: 'Playback position must be a non-negative number.' });
          return;
        }

        lounge.playback = {
          isPlaying: action === 'position'
            ? Boolean(lounge.playback?.isPlaying)
            : action === 'play',
          positionSeconds,
          updatedAt: new Date(),
        };
        await lounge.save();
        io.to(loungeId).emit('lounge:playback:update', {
          event: 'lounge.playback.update',
          loungeId,
          payload: { ...lounge.playback.toObject(), trackId: toId(lounge.currentTrack) },
          ts: Date.now(),
        });
      } catch (error) {
        console.error('lounge:playback:control error:', error.message);
        socket.emit('error', { message: 'Could not update room playback.' });
      }
    });

    // === LEAVE A LOUNGE ROOM ===
    socket.on('lounge:leave', async ({ loungeId }) => {
      if (!loungeId || socket.currentLoungeId !== loungeId) return;
      await socket.leave(loungeId);
      socket.currentLoungeId = null;
      console.log(`  ← ${socket.user.displayName} left room: ${loungeId}`);
      try {
        await publishDeparture(io, loungeId, socket, 'left');
      } catch (error) {
        console.error('Presence update failed:', error.message);
        socket.emit('error', { message: 'Could not update lounge presence.' });
      }
    });

    // === TYPING INDICATOR ===
    // Client sends: { loungeId: '...', isTyping: true/false }
    socket.on('lounge:typing', async ({ loungeId, isTyping }) => {
      try {
        if (!loungeId || socket.currentLoungeId !== loungeId) return;
        const lounge = await Lounge.findById(loungeId).select('participants mutedParticipants');
        if (!lounge || !isLoungeMember(lounge, socket.user)) return;
        if (lounge.mutedParticipants.some((id) => toId(id) === toId(socket.user))) return;
        if (!typingUsers[loungeId]) typingUsers[loungeId] = {};

        if (isTyping) {
          typingUsers[loungeId][socket.user._id] = socket.user.displayName;
        } else {
          delete typingUsers[loungeId][socket.user._id];
        }

        socket.to(loungeId).emit('lounge:typing:update', {
          event: 'lounge.typing.update',
          loungeId,
          payload: { typingUsers: Object.values(typingUsers[loungeId]) },
          ts: Date.now(),
        });
      } catch (error) {
        console.error('lounge:typing error:', error.message);
        socket.emit('error', { message: 'Could not update the typing indicator.' });
      }
    });

    // === PING / PONG for latency measurement ===
    socket.on('lounge:ping', ({ loungeId, clientSentAt }) => {
      if (!loungeId || socket.currentLoungeId !== loungeId) return;
      socket.emit('lounge:pong', {
        event: 'lounge.sync.pong',
        loungeId,
        payload: {
          clientSentAt,
          serverReceivedAt: Date.now(),
        },
      });
    });

    // === HANDLE DISCONNECT ===
    socket.on('disconnect', (reason) => {
      console.log(`🔌 Socket disconnected: ${socket.user.displayName} — reason: ${reason}`);

      // If they were in a lounge, notify the room
      if (socket.currentLoungeId) {
        const loungeId = socket.currentLoungeId;
        // Clean up typing state
        if (typingUsers[loungeId]) {
          delete typingUsers[loungeId][socket.user._id];
        }

        const unexpectedDisconnect = isUnexpectedDisconnect(reason);
        publishDeparture(
          io,
          loungeId,
          socket,
          unexpectedDisconnect ? 'disconnected' : 'left',
          unexpectedDisconnect
        )
          .catch((error) => console.error('Presence update failed:', error.message));
      }
    });
  });
};

module.exports = socketHandler;
