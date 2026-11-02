// controllers/chatController.js - Chat messages with sentiment scoring

const ChatMessage = require('../models/ChatMessage');
const Lounge = require('../models/Lounge');
const QueueEvent = require('../models/QueueEvent');
const { analyzeMessage, aggregateRoomSentiment, getSentimentLabel } = require('../services/sentimentEngine');
const { canControlLounge } = require('../services/accessPolicy');
const ALLOWED_REACTIONS = ['👍', '❤️', '🔥', '🎵', '😂', '🙌'];

function publicReactions(reactions, userId) {
  return reactions.map((reaction) => ({
    emoji: reaction.emoji,
    count: reaction.users.length,
    reactedByMe: reaction.users.some((id) => String(id) === String(userId)),
  }));
}

// @route   POST /api/chat/:loungeId
// @desc    Send a chat message in a lounge
// @access  Private
const sendMessage = async (req, res, next) => {
  try {
    const { body } = req.body;
    const lounge = await Lounge.findById(req.params.loungeId);

    if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });
    if (lounge.status === 'ended') return res.status(400).json({ success: false, message: 'Session has ended.' });

    if (typeof body !== 'string' || body.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Message cannot be empty.' });
    }
    if (body.length > 500) return res.status(400).json({ success: false, message: 'Message cannot exceed 500 characters.' });
    if (lounge.locked && !canControlLounge(lounge, req.user)) {
      return res.status(403).json({ success: false, message: 'This lounge is locked.' });
    }
    if ((lounge.mutedParticipants || []).some((id) => String(id) === String(req.user.id))) {
      return res.status(403).json({ success: false, message: 'You are muted in this lounge.' });
    }

    // Analyze sentiment of this message
    const sentimentScore = analyzeMessage(body);

    // Save the message
    const message = await ChatMessage.create({
      lounge: lounge._id,
      user: req.user.id,
      msgType: 'chat',
      body: body.trim(),
      sentimentScore,
    });

    // Re-calculate the room's overall sentiment after this new message
    const recentMessages = await ChatMessage.find({
      lounge: lounge._id,
      msgType: 'chat',
      createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) }, // Last 10 minutes
    }).select('sentimentScore createdAt').limit(50);

    const newRoomSentiment = aggregateRoomSentiment(recentMessages);

    // Update the lounge's sentiment score
    lounge.currentSentimentScore = newRoomSentiment;
    await lounge.save();

    // Log sentiment tick event
    await QueueEvent.create({
      lounge: lounge._id,
      user: req.user.id,
      type: 'sentimentTick',
      payload: {
        sentimentScore: newRoomSentiment,
        label: getSentimentLabel(newRoomSentiment),
        messageCount: recentMessages.length,
      },
      sentimentAtEvent: newRoomSentiment,
    });
    await QueueEvent.create({
      lounge: lounge._id,
      user: req.user.id,
      type: 'chat',
      payload: { messageId: message._id, sentimentScore },
      sentimentAtEvent: sentimentScore,
    });

    // Broadcast the message to all room participants via Socket.io
    const populatedMessage = await ChatMessage.findById(message._id).populate('user', 'displayName');

    const io = req.app.get('io');
    io.to(lounge._id.toString()).emit('lounge:chat:message', {
      event: 'lounge.chat.message',
      loungeId: lounge._id,
      payload: {
        messageId: message._id,
        user: { id: req.user.id, displayName: req.user.displayName },
        body: message.body,
        sentimentScore: message.sentimentScore,
        sentimentBucket: getSentimentLabel(message.sentimentScore),
        createdAt: message.createdAt,
      },
      ts: Date.now(),
    });

    // Also broadcast the updated room sentiment score
    io.to(lounge._id.toString()).emit('lounge:sentiment:update', {
      event: 'lounge.sentiment.score',
      loungeId: lounge._id,
      payload: {
        rollingScore: newRoomSentiment,
        label: getSentimentLabel(newRoomSentiment),
        windowSeconds: 600, // 10 minutes
        sampleSize: recentMessages.length,
      },
      ts: Date.now(),
    });

    res.status(201).json({
      success: true,
      message: populatedMessage,
      roomSentiment: {
        score: newRoomSentiment,
        label: getSentimentLabel(newRoomSentiment),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/chat/:loungeId
// @desc    Get chat message history for a lounge
// @access  Private
const getMessages = async (req, res, next) => {
  try {
    const { limit = 50, before } = req.query;

    const filter = { lounge: req.params.loungeId };
    if (before) {
      filter.createdAt = { $lt: new Date(before) };
    }

    const messages = await ChatMessage.find(filter)
      .populate('user', 'displayName')
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    // Return in chronological order (oldest first)
    messages.reverse();

    const publicMessages = messages.map((message) => {
      const result = message.toObject();
      result.reactions = publicReactions(message.reactions, req.user.id);
      return result;
    });
    res.status(200).json({ success: true, count: messages.length, messages: publicMessages });
  } catch (error) {
    next(error);
  }
};

const reactToMessage = async (req, res, next) => {
  try {
    const { emoji } = req.body;
    if (!ALLOWED_REACTIONS.includes(emoji)) {
      return res.status(400).json({ success: false, message: 'Choose a supported emoji reaction.' });
    }

    const message = await ChatMessage.findOne({
      _id: req.params.messageId,
      lounge: req.params.loungeId,
      msgType: 'chat',
    });
    if (!message) return res.status(404).json({ success: false, message: 'Chat message not found.' });

    let reaction = message.reactions.find((item) => item.emoji === emoji);
    if (!reaction) {
      message.reactions.push({ emoji, users: [req.user.id] });
    } else if (reaction.users.some((id) => String(id) === String(req.user.id))) {
      reaction.users.pull(req.user.id);
      if (reaction.users.length === 0) message.reactions.pull(reaction._id);
    } else {
      reaction.users.addToSet(req.user.id);
    }
    await message.save();

    const reactions = publicReactions(message.reactions, req.user.id);
    const io = req.app.get('io');
    io.to(String(req.params.loungeId)).emit('lounge:chat:reaction', {
      event: 'lounge.chat.reaction',
      loungeId: req.params.loungeId,
      payload: {
        messageId: message._id,
        userId: req.user.id,
        reactions: reactions.map(({ emoji, count }) => ({ emoji, count })),
      },
      ts: Date.now(),
    });
    res.status(200).json({ success: true, messageId: message._id, reactions });
  } catch (error) {
    next(error);
  }
};

module.exports = { sendMessage, getMessages, reactToMessage };
