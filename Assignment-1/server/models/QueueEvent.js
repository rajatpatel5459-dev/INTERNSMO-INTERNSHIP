// models/QueueEvent.js - Append-only event log for analytics

const mongoose = require('mongoose');

// Every significant action in a lounge is logged here.
// This feeds the session analytics (sentiment timeline, battle count, etc.)
const queueEventSchema = new mongoose.Schema(
  {
    lounge: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lounge',
      required: true,
      index: true, // We always query events by lounge
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null for system/AI events
    },
    // What kind of event this is
    type: {
      type: String,
      enum: [
        'vote',          // User voted on a queue track
        'segue',         // AI DJ selected the next track
        'segueApproved', // Host approved an AI DJ segue
        'aiQuestion',    // Listener asked the AI DJ about track metadata
        'battleOpened',  // Soundclash battle started
        'battleResolved',// Soundclash battle ended
        'chat',          // Chat message (with sentiment)
        'sentimentTick', // Periodic sentiment snapshot
        'trackAdded',    // Track added to queue
        'trackRemoved',  // Track removed from queue
        'trackPlaying',  // Track started playing
        'userJoined',    // User joined the lounge
        'userLeft',      // User left the lounge
      ],
      required: true,
    },
    // Flexible payload - stores event-specific data
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Sentiment score at the time of this event (for timeline graphs)
    sentimentAtEvent: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt = event timestamp
  }
);

module.exports = mongoose.model('QueueEvent', queueEventSchema);
