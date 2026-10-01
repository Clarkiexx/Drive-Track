const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/role');
const uploadLicensePhoto = require('../middleware/uploadLicense');

const router = express.Router();

router.post(
  '/driver/register',
  uploadLicensePhoto.single('licensePhoto'),
  [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('licenseNumber').trim().notEmpty().withMessage('License number is required'),
    body('middleInitial').optional({ checkFalsy: true }).isLength({ max: 5 }),
    body('contactNumber').optional({ checkFalsy: true }).trim(),
    body('address').optional({ checkFalsy: true }).trim(),
  ],
  authController.driverRegister
);

router.post(
  '/driver/forgot-password',
  [
    body('fullName').trim().notEmpty().withMessage('Full name is required'),
    body('licenseNumber').trim().notEmpty().withMessage('License number is required'),
  ],
  authController.driverForgotPassword
);

router.post(
  '/driver/login',
  [
    body('fullName').trim().notEmpty().withMessage('Full name is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  authController.driverLogin
);

router.post(
  '/driver/change-password',
  authenticate,
  allowRoles('driver'),
  [
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters'),
  ],
  authController.driverChangePassword
);

router.post(
  '/enforcer/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  authController.enforcerLogin
);

router.post(
  '/admin/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  authController.adminLogin
);

module.exports = router;
