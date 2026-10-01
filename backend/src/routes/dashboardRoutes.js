const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/role');

const router = express.Router();

router.use(authenticate, allowRoles('admin'));

router.get('/summary', dashboardController.getSummary);
router.get('/trend', dashboardController.getTrend);
router.get('/recent-activity', dashboardController.getRecentActivity);

module.exports = router;
