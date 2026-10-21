const express = require('express');
const geocodeController = require('../controllers/geocodeController');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/role');

const router = express.Router();

// Citation GPS coordinates are only resolved for the staff who issue
// citations; drivers never need this lookup.
router.get('/reverse', authenticate, allowRoles('enforcer', 'admin'), geocodeController.reverse);

module.exports = router;
