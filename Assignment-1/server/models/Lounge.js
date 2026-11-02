// models/Lounge.js - DJ Lounge schema

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// A single entry in the queue (ordered list of tracks)
const queueEntrySchema = new mongoose.Schema({
  track: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Track',
    required: true,
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  votes: { type: Number, default: 0 },
  voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isBattleWinner: { type: Boolean, default: false },
  // Higher position number = later in queue
  position: { type: Number, default: 0 },
});

// Soundclash battle schema (embedded in the lounge)
const soundclashSchema = new mongoose.Schema({
  active: { type: Boolean, default: false },
  // 2 to 4 tracks competing
  candidates: [
    {
      track: { type: mongoose.Schema.Types.ObjectId, ref: 'Track' },
      submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      votes: { type: Number, default: 0 },
      // Track which users voted so they can't vote twice
      voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    },
  ],
  openedAt: Date,
  closesAt: Date, // Battle auto-resolves at this time
  winnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Track', default: null },
});

const playbackSchema = new mongoose.Schema({
  isPlaying: { type: Boolean, default: false },
  positionSeconds: { type: Number, min: 0, default: 0 },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

const loungeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Lounge name is required'],
      trim: true,
      maxlength: [100, 'Lounge name cannot exceed 100 characters'],
    },
    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Invite code to join this lounge (auto-generated, short and shareable)
    inviteCode: {
      type: String,
      unique: true,
      default: () => uuidv4().slice(0, 8).toUpperCase(), // e.g., "A3F7B2C1"
    },
    correlationId: {
      type: String,
      required: true,
      default: uuidv4,
      immutable: true,
      index: true,
    },
    // Overall vibe/mood of this lounge session
    vibeProfile: {
      type: String,
      enum: ['High-Energy EDM', 'Lo-Fi Chill', 'Hip-Hop', 'Pop Hits', 'Acoustic', 'Mixed'],
      default: 'Mixed',
    },
    status: {
      type: String,
      enum: ['scheduled', 'live', 'ended'],
      default: 'scheduled',
    },
    startedAt: { type: Date, default: null },
    // The track currently playing
    currentTrack: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Track',
      default: null,
    },
    playback: {
      type: playbackSchema,
      default: () => ({}),
    },
    // The ordered queue of upcoming tracks
    queue: [queueEntrySchema],
    // Soundclash battle state
    soundclash: {
      type: soundclashSchema,
      default: () => ({ active: false, candidates: [], votes: {} }),
    },
    // Users currently in this lounge
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    coDjs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    mutedParticipants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    bannedParticipants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    locked: { type: Boolean, default: false },
    hostDisconnected: { type: Boolean, default: false },
    // Lounge configuration
    settings: {
      maxParticipants: { type: Number, default: 50 },
      bpmTolerancePct: { type: Number, default: 8 }, // ±8% BPM for harmonic matching
      aiOutroWindowSeconds: { type: Number, min: 5, max: 30, default: 5 },
      soundclashEnabled: { type: Boolean, default: true },
      aiVerbosity: {
        type: String,
        enum: ['quiet', 'normal', 'verbose'],
        default: 'normal',
      },
    },
    // Live sentiment score: -1 (very negative) to +1 (very positive)
    currentSentimentScore: { type: Number, default: 0 },
    endedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Lounge', loungeSchema);
