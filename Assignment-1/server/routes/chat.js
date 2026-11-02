// routes/chat.js
const express = require('express');
const router = express.Router();
const { sendMessage, getMessages, reactToMessage } = require('../controllers/chatController');
const { protect } = require('../middleware/auth');
const { loadLounge, requireLoungeParticipant } = require('../middleware/loungeAccess');

router.get('/:loungeId', protect, loadLounge, requireLoungeParticipant, getMessages);
router.post('/:loungeId', protect, loadLounge, requireLoungeParticipant, sendMessage);
router.post('/:loungeId/:messageId/reactions', protect, loadLounge, requireLoungeParticipant, reactToMessage);

module.exports = router;
