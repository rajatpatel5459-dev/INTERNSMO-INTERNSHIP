// controllers/analyticsController.js - Session analytics

const Lounge = require('../models/Lounge');
const QueueEvent = require('../models/QueueEvent');
const ChatMessage = require('../models/ChatMessage');

// @route   GET /api/analytics/:loungeId
// @desc    Get analytics for a specific lounge session
// @access  Private
const getLoungeAnalytics = async (req, res, next) => {
  try {
    const lounge = await Lounge.findById(req.params.loungeId)
      .populate('host', 'displayName')
      .populate('currentTrack', 'title artist');

    if (!lounge) return res.status(404).json({ success: false, message: 'Lounge not found.' });

    // Get all events for this lounge
    const allEvents = await QueueEvent.find({ lounge: lounge._id }).sort({ createdAt: 1 });

    // Count different event types
    const battleEvents = allEvents.filter((e) => e.type === 'battleOpened');
    const aiSegues = allEvents.filter((e) => e.type === 'segue');
    const aiQuestions = allEvents.filter((e) => e.type === 'aiQuestion');

    // Calculate session duration
    const sessionStart = lounge.startedAt || (lounge.status !== 'scheduled' ? lounge.createdAt : null);
    const sessionEnd = lounge.endedAt || new Date();
    const durationMinutes = sessionStart
      ? Math.round((sessionEnd - sessionStart) / 60000)
      : 0;

    const activeParticipants = new Set();
    const allParticipants = new Set();
    let peakParticipants = 0;
    allEvents.forEach((event) => {
      if (!event.user) return;
      const participantId = String(event.user);
      if (event.type === 'userJoined') {
        activeParticipants.add(participantId);
        allParticipants.add(participantId);
        peakParticipants = Math.max(peakParticipants, activeParticipants.size);
      } else if (event.type === 'userLeft') {
        activeParticipants.delete(participantId);
      }
    });

    // Build sentiment timeline (one point per sentiment tick event)
    const sentimentTimeline = allEvents
      .filter((e) => e.type === 'sentimentTick' && e.sentimentAtEvent !== null)
      .map((e) => ({
        time: e.createdAt,
        score: e.sentimentAtEvent,
        label: e.payload.label || '',
      }));

    // Track plays
    const trackPlayEvents = allEvents.filter((e) => e.type === 'trackPlaying');
    const tracksPlayed = trackPlayEvents.length;

    res.status(200).json({
      success: true,
      analytics: {
        lounge: {
          id: lounge._id,
          name: lounge.name,
          host: lounge.host,
          vibeProfile: lounge.vibeProfile,
          status: lounge.status,
          createdAt: lounge.createdAt,
          endedAt: lounge.endedAt,
        },
        session: {
          durationMinutes,
          peakParticipants,
          totalParticipants: allParticipants.size,
          tracksPlayed,
          soundclashBattles: battleEvents.length,
          aiDjSegues: aiSegues.length,
          aiDjQuestions: aiQuestions.length,
          totalEvents: allEvents.length,
        },
        sentiment: {
          current: lounge.currentSentimentScore,
          timeline: sentimentTimeline,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/analytics/user/summary
// @desc    Get a summary of all lounges for the current user (dashboard data)
// @access  Private
const getUserDashboard = async (req, res, next) => {
  try {
    // Get lounges this user hosted
    const hostedLounges = await Lounge.find({ host: req.user.id })
      .populate('currentTrack', 'title artist coverImageUrl')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get lounges this user attended
    const attendedLounges = await Lounge.find({
      participants: req.user.id,
      host: { $ne: req.user.id }, // Exclude hosted ones (already counted above)
    })
      .populate('host', 'displayName')
      .populate('currentTrack', 'title artist coverImageUrl')
      .sort({ createdAt: -1 })
      .limit(10);

    // Find currently active lounges they can quickly rejoin
    const activeLounges = await Lounge.find({
      status: 'live',
      participants: req.user.id,
    })
      .populate('host', 'displayName')
      .populate('currentTrack', 'title artist coverImageUrl')
      .limit(5);

    res.status(200).json({
      success: true,
      dashboard: {
        activeLounges,
        hostedLounges,
        attendedLounges,
        stats: {
              totalHosted: await Lounge.countDocuments({ host: req.user.id }),
              totalAttended: await Lounge.countDocuments({
                participants: req.user.id,
                host: { $ne: req.user.id },
              }),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getLoungeAnalytics, getUserDashboard };
