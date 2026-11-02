// models/Track.js - Track schema with acoustic features and metadata timeline

const mongoose = require('mongoose');

// Valid Camelot key codes (used for harmonic mixing)
const VALID_CAMELOT_KEYS = [
  '1A', '2A', '3A', '4A', '5A', '6A', '7A', '8A', '9A', '10A', '11A', '12A',
  '1B', '2B', '3B', '4B', '5B', '6B', '7B', '8B', '9B', '10B', '11B', '12B',
];

const trackSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Track title is required'],
      trim: true,
    },
    artist: {
      type: String,
      required: [true, 'Artist name is required'],
      trim: true,
    },
    album: {
      type: String,
      default: '',
    },
    genre: {
      type: String,
      default: '',
    },
    durationSeconds: {
      type: Number,
      required: [true, 'Track duration is required'],
      min: [1, 'Duration must be positive'],
    },
    audioAssetUrl: {
      type: String,
      default: '', // Local file path or URL
    },
    coverImageUrl: {
      type: String,
      default: '',
    },
    // Acoustic features - the core data the AI DJ uses
    acoustic: {
      bpm: {
        type: Number,
        required: [true, 'BPM is required'],
        min: [20, 'BPM must be at least 20'],
        max: [300, 'BPM cannot exceed 300'],
      },
      camelotKey: {
        type: String,
        required: [true, 'Camelot key is required'],
        enum: {
          values: VALID_CAMELOT_KEYS,
          message: 'Invalid Camelot key. Must be one of the 24 valid codes (e.g., 8A, 9B)',
        },
      },
      energy: {
        type: Number,
        required: [true, 'Energy is required'],
        min: [0, 'Energy must be between 0 and 1'],
        max: [1, 'Energy must be between 0 and 1'],
      },
      valence: {
        type: Number,
        required: [true, 'Valence is required'],
        min: [0, 'Valence must be between 0 and 1'],
        max: [1, 'Valence must be between 0 and 1'],
      },
      demoOnly: {
        type: Boolean,
        default: false,
      },
    },
    // Timeline metadata for RAG grounding (AI DJ trivia, sample credits, etc.)
    timeline: [
      {
        ts: { type: Number, required: true, min: [0, 'Timeline timestamp cannot be negative'] }, // Timestamp in seconds within the track
        type: {
          type: String,
          enum: ['sample_credit', 'trivia', 'glossary'],
          required: true,
        },
        text: { type: String, required: true, trim: true },
      },
    ],
    // Who uploaded this track
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Track', trackSchema);
