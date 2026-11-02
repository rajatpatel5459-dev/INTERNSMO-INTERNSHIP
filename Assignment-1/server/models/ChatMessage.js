// models/ChatMessage.js - Chat messages in a lounge

const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  emoji: { type: String, required: true },
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
});

const chatMessageSchema = new mongoose.Schema(
  {
    lounge: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lounge',
      required: true,
      index: true,
    },
    // null if it's an AI DJ or system message
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    msgType: {
      type: String,
      enum: ['chat', 'ai_answer', 'system', 'dj_announcement'],
      default: 'chat',
    },
    body: {
      type: String,
      required: [true, 'Message body cannot be empty'],
      maxlength: [500, 'Message cannot exceed 500 characters'],
    },
    // Sentiment score for this message: -1 (negative) to +1 (positive)
    // Calculated by the sentiment engine
    sentimentScore: {
      type: Number,
      default: null,
    },
    // For AI_answer messages - which question this is answering
    replyTo: {
      type: String,
      default: null,
    },
    reactions: { type: [reactionSchema], default: [] },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
