// routes/analytics.js
const express = require('express');
const router = express.Router();
const { getLoungeAnalytics, getUserDashboard } = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');
const { loadLounge, requireLoungeParticipant } = require('../middleware/loungeAccess');

router.get('/user/dashboard', protect, getUserDashboard);
router.get('/:loungeId', protect, loadLounge, requireLoungeParticipant, getLoungeAnalytics);

module.exports = router;
