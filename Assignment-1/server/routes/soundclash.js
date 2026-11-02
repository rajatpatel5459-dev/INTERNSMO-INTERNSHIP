// routes/soundclash.js
const express = require('express');
const router = express.Router();
const {
  submitTrack,
  removeTrack,
  openBattle,
  voteInBattle,
  resolveBattle,
  getSoundclashState,
} = require('../controllers/soundclashController');
const { protect } = require('../middleware/auth');
const { loadLounge, requireLoungeParticipant, requireLoungeControl, requireLoungeHost } = require('../middleware/loungeAccess');

router.get('/:loungeId', protect, loadLounge, requireLoungeParticipant, getSoundclashState);
router.post('/:loungeId/submit', protect, loadLounge, requireLoungeParticipant, submitTrack);
router.delete('/:loungeId/candidates/:trackId', protect, loadLounge, requireLoungeParticipant, requireLoungeHost, removeTrack);
router.post('/:loungeId/open', protect, loadLounge, requireLoungeParticipant, requireLoungeControl, requireLoungeHost, openBattle);
router.post('/:loungeId/vote', protect, loadLounge, requireLoungeParticipant, voteInBattle);
router.post('/:loungeId/resolve', protect, loadLounge, requireLoungeParticipant, requireLoungeControl, resolveBattle);

module.exports = router;
