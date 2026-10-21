const express = require('express');
const mediaController = require('../controllers/mediaController');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/role');

const router = express.Router();

// License photos are personal documents: admins only, same rule as the
// legacy /uploads/licenses static mount in app.js.
router.get('/license-photo', authenticate, allowRoles('admin'), mediaController.getLicensePhoto);

module.exports = router;
