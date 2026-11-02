// routes/lounges.js
const express = require('express');
const router = express.Router();
const {
  createLounge,
  joinLounge,
  getActiveLounges,
  getLoungeById,
  updateLoungeStatus,
  getMyLoungeHistory,
  moderateLounge,
  leaveLounge,
} = require('../controllers/loungeController');
const { protect } = require('../middleware/auth');
const { loadLounge, requireLoungeParticipant, requireLoungeControl, requireLoungeHost } = require('../middleware/loungeAccess');

router.get('/', protect, getActiveLounges);
router.get('/my', protect, getMyLoungeHistory);
router.get('/:id', protect, loadLounge, requireLoungeParticipant, getLoungeById);
router.post('/', protect, createLounge);
router.post('/join', protect, joinLounge);
router.put('/:id/status', protect, loadLounge, requireLoungeParticipant, requireLoungeHost, updateLoungeStatus);
router.post('/:id/leave', protect, loadLounge, requireLoungeParticipant, leaveLounge);
router.put('/:id/moderation', protect, loadLounge, requireLoungeParticipant, requireLoungeHost, moderateLounge);

module.exports = router;
