const express = require('express');
const { body } = require('express-validator');
const citationController = require('../controllers/citationController');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/role');
const uploadEvidence = require('../middleware/upload');

const router = express.Router();

router.use(authenticate);

router.post(
  '/',
  allowRoles('enforcer'),
  uploadEvidence.array('photos', 5),
  [
    body('driverId').notEmpty().withMessage('Driver is required'),
    body('placeOfViolation').trim().notEmpty().withMessage('Place of violation is required'),
    body('violationTypeIds').notEmpty().withMessage('At least one violation type must be selected'),
    body('plateNumber').trim().notEmpty().withMessage('Plate number is required'),
    body('registeredOwner').trim().notEmpty().withMessage('Registered owner is required'),
    body('vehicleUnitType').trim().notEmpty().withMessage('Vehicle unit type is required'),
    body('latitude').notEmpty().withMessage('GPS coordinates are required').isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
    body('longitude').notEmpty().withMessage('GPS coordinates are required').isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
  ],
  citationController.createCitation
);

// Specific string routes MUST come before the '/:id' catch-all below,
// otherwise Express would try to match "mine"/"driver" as an :id value.
router.get('/mine', allowRoles('enforcer'), citationController.listMyCitations);
router.get('/driver/mine', allowRoles('driver'), citationController.listMyViolationsAsDriver);

// Admin's Violation Monitoring list
router.get('/', allowRoles('admin'), citationController.listAllCitations);

router.patch('/:id/verify', allowRoles('admin'), citationController.verifyCitation);
router.patch('/:id/fine-amount', allowRoles('admin'), citationController.overrideFineAmount);
router.patch('/:id/settle', allowRoles('admin'), citationController.settleCitation);
router.patch('/:id/remind', allowRoles('admin'), citationController.sendReminder);
router.patch('/:id/cancel', allowRoles('admin'), citationController.cancelCitation);
router.patch('/:id/protest', allowRoles('admin'), citationController.resolveProtest);

router.get('/:id', allowRoles('enforcer', 'admin', 'driver'), citationController.getCitation);

module.exports = router;
