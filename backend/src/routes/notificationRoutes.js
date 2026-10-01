const express = require('express');
const { body } = require('express-validator');
const notificationController = require('../controllers/notificationController');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/role');

const router = express.Router();

router.use(authenticate);

router.get('/mine', allowRoles('driver'), notificationController.listMyNotifications);
router.patch('/mark-all-read', allowRoles('driver'), notificationController.markAllAsRead);
router.patch('/:id/read', allowRoles('driver'), notificationController.markAsRead);

router.get('/enforcer/mine', allowRoles('enforcer'), notificationController.listMyEnforcerNotifications);
router.patch('/enforcer/mark-all-read', allowRoles('enforcer'), notificationController.markAllEnforcerAsRead);
router.patch('/enforcer/:id/read', allowRoles('enforcer'), notificationController.markEnforcerAsRead);

router.post(
  '/broadcast',
  allowRoles('admin'),
  [
    body('recipientType')
      .isIn(['unsettled_drivers', 'all_drivers', 'all_enforcers', 'everyone', 'single_driver', 'single_enforcer'])
      .withMessage('Invalid recipient type'),
    body('message').trim().isLength({ min: 1, max: 500 }).withMessage('Message must be 1-500 characters'),
  ],
  notificationController.sendBroadcast
);
router.get('/broadcasts', allowRoles('admin'), notificationController.listBroadcasts);

module.exports = router;
