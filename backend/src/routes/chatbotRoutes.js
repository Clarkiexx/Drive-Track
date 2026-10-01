const express = require('express');
const chatbotController = require('../controllers/chatbotController');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/role');

const router = express.Router();

router.get('/health', authenticate, (req, res) => res.json({ success: true, data: { ok: true } }));
router.post('/ask', authenticate, allowRoles('driver'), chatbotController.ask);

module.exports = router;
