const express = require('express');
const { body } = require('express-validator');
const driverController = require('../controllers/driverController');
const citationController = require('../controllers/citationController');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/role');
const uploadLicensePhoto = require('../middleware/uploadLicense');

const router = express.Router();

router.use(authenticate); // every route below requires SOME valid login; specific roles checked per-route

// Admin's full paginated Driver Management list
router.get('/', allowRoles('admin'), driverController.listDrivers);

// Enforcer's Driver Search screen — also usable by admin
router.get('/search', allowRoles('enforcer', 'admin'), driverController.searchDrivers);

router.get('/:id', allowRoles('admin', 'enforcer'), driverController.getDriver);
router.get('/:id/citations', allowRoles('admin', 'enforcer'), citationController.getDriverCitations);

// Both admin (Add Driver modal) and enforcer (on-the-spot creation during
// apprehension) can create a driver record — same underlying action.
// uploadLicensePhoto.single() only engages for multipart requests (the
// enforcer app); admin's plain-JSON Add Driver requests pass through
// untouched, since there's no photo field in that flow.
router.post(
  '/',
  allowRoles('admin', 'enforcer'),
  uploadLicensePhoto.single('licensePhoto'),
  [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('licenseNumber').trim().notEmpty().withMessage('License number is required'),
  ],
  driverController.createDriver
);

router.patch('/:id', allowRoles('admin'), driverController.updateDriver);
router.patch('/:id/status', allowRoles('admin'), driverController.updateDriverStatus);
router.delete('/:id', allowRoles('admin'), driverController.deleteDriver);

module.exports = router;
