// routes/aiDj.js
const express = require('express');
const router = express.Router();
const { getAiSegue, askAiDj, askTrackQuestion, getCompatibleTracks } = require('../controllers/aiDjController');
const { protect } = require('../middleware/auth');
const { loadLounge, requireLoungeParticipant, requireLoungeControl } = require('../middleware/loungeAccess');
const { applyAiSegue } = require('../controllers/aiDjController');

router.get('/:loungeId/compatible', protect, loadLounge, requireLoungeParticipant, getCompatibleTracks);
router.post('/tracks/:trackId/ask', protect, askTrackQuestion);
router.post('/:loungeId/segue', protect, loadLounge, requireLoungeParticipant, requireLoungeControl, getAiSegue);
router.post('/:loungeId/segue/apply', protect, loadLounge, requireLoungeParticipant, requireLoungeControl, applyAiSegue);
router.post('/:loungeId/ask', protect, loadLounge, requireLoungeParticipant, askAiDj);

module.exports = router;
