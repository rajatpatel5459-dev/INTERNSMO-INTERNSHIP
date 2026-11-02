// routes/recommendations.js
const express = require('express');
const router = express.Router();
const { getMyRecommendations, getMyTasteProfile, getMyInteractions, recordInteraction } = require('../controllers/recommendationController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getMyRecommendations);
router.get('/taste-profile', protect, getMyTasteProfile);
router.get('/interactions', protect, getMyInteractions);
router.post('/interaction', protect, recordInteraction);

module.exports = router;
