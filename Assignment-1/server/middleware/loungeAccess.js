const Lounge = require('../models/Lounge');
const { isLoungeMember, canControlLounge, isLoungeHost } = require('../services/accessPolicy');

async function loadLounge(req, res, next) {
  try {
    const loungeId = req.params.loungeId || req.params.id;
    const lounge = await Lounge.findById(loungeId);
    if (!lounge) {
      return res.status(404).json({ success: false, message: 'Lounge not found.' });
    }
    req.lounge = lounge;
    if (lounge.correlationId) {
      req.correlationId = lounge.correlationId;
      res.setHeader('X-Correlation-ID', lounge.correlationId);
    }
    next();
  } catch (error) {
    next(error);
  }
}

function requireLoungeParticipant(req, res, next) {
  if (!isLoungeMember(req.lounge, req.user)) {
    return res.status(403).json({ success: false, message: 'Join this lounge before using its live features.' });
  }
  next();
}

function requireLoungeControl(req, res, next) {
  if (req.lounge.hostDisconnected) {
    return res.status(423).json({ success: false, message: 'Queue controls are frozen until the host reconnects.' });
  }
  if (!canControlLounge(req.lounge, req.user)) {
    return res.status(403).json({ success: false, message: 'Host or Co-DJ access is required for this action.' });
  }
  next();
}

function requireLoungeHost(req, res, next) {
  if (!isLoungeHost(req.lounge, req.user)) {
    return res.status(403).json({ success: false, message: 'Host or Admin access is required for this action.' });
  }
  next();
}

module.exports = {
  loadLounge,
  requireLoungeParticipant,
  requireLoungeControl,
  requireLoungeHost,
};
