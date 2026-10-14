const express = require('express');
const { body } = require('express-validator');
const enforcerController = require('../controllers/enforcerController');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/role');
const uploadAvatar = require('../middleware/uploadAvatar');

const router = express.Router();

// My Profile self-service for the signed-in enforcer. Registered ABOVE the
// admin-only gate below: router.use() applies only to routes registered
// after it, so these two stay enforcer-accessible while everything else
// remains admin-only. Identity fields (employeeId, badgeNumber, station,
// status) are not accepted here — see updateEnforcerMe.
router.patch(
  '/me',
  authenticate,
  allowRoles('enforcer'),
  [
    body('firstName').optional().trim().notEmpty().withMessage('First name is required'),
    body('lastName').optional().trim().notEmpty().withMessage('Last name is required'),
    body('address').optional({ checkFalsy: true }).trim(),
    body('contactNumber').optional({ checkFalsy: true }).trim(),
  ],
  enforcerController.updateEnforcerMe
);

router.patch(
  '/me/photo',
  authenticate,
  allowRoles('enforcer'),
  uploadAvatar.single('photo'),
  enforcerController.updateEnforcerPhotoMe
);

router.use(authenticate, allowRoles('admin'));

router.get('/', enforcerController.listEnforcers);
router.get('/:id', enforcerController.getEnforcer);

router.post(
  '/',
  [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('employeeId').trim().notEmpty().withMessage('Enforcer ID Number is required'),
  ],
  enforcerController.createEnforcer
);

router.patch('/:id', enforcerController.updateEnforcer);
router.patch('/:id/status', enforcerController.updateEnforcerStatus);
router.patch('/:id/reset-password', enforcerController.resetEnforcerPassword);
router.delete('/:id', enforcerController.deleteEnforcer);

module.exports = router;
