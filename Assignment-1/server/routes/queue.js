// routes/queue.js
const express = require('express');
const router = express.Router();
const { addTrackToQueue, voteForTrack, removeTrackFromQueue, getQueue, advanceToNextTrack } = require('../controllers/queueController');
const { protect } = require('../middleware/auth');
const { loadLounge, requireLoungeParticipant, requireLoungeControl } = require('../middleware/loungeAccess');

router.get('/:loungeId', protect, loadLounge, requireLoungeParticipant, getQueue);
router.post('/:loungeId/add', protect, loadLounge, requireLoungeParticipant, addTrackToQueue);
router.post('/:loungeId/vote', protect, loadLounge, requireLoungeParticipant, voteForTrack);
router.delete('/:loungeId/:queueEntryId', protect, loadLounge, requireLoungeParticipant, removeTrackFromQueue);
router.post('/:loungeId/next', protect, loadLounge, requireLoungeParticipant, requireLoungeControl, advanceToNextTrack);

module.exports = router;
