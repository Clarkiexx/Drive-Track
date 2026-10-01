const express = require('express');
const auditLogController = require('../controllers/auditLogController');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/role');

const router = express.Router();

router.get('/', authenticate, allowRoles('admin'), auditLogController.listAuditLogs);

module.exports = router;
