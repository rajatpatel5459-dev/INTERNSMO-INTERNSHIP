// models/Interaction.js - User-track listening interactions
// This is the data that feeds the recommendation engine

const mongoose = require('mongoose');

const interactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    track: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Track',
      required: true,
      index: true,
    },
    // How many seconds of the track the user listened to
    playedSeconds: {
      type: Number,
      default: 0,
    },
    // Did they listen until the end?
    completed: {
      type: Boolean,
      default: false,
    },
    // Did they explicitly like it?
    liked: {
      type: Boolean,
      default: false,
    },
    // Other users who were listening at the same time
    // Used for collaborative filtering recommendations
    coListenedWith: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Which lounge this interaction happened in
    lounge: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lounge',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Interaction', interactionSchema);

