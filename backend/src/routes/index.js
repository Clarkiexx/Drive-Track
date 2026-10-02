const express = require('express');
const authRoutes = require('./authRoutes');
const driverRoutes = require('./driverRoutes');
const enforcerRoutes = require('./enforcerRoutes');
const violationTypeRoutes = require('./violationTypeRoutes');
const citationRoutes = require('./citationRoutes');
const notificationRoutes = require('./notificationRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const chatbotRoutes = require('./chatbotRoutes');
const auditLogRoutes = require('./auditLogRoutes');
const paymentRoutes = require('./paymentRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/drivers', driverRoutes);
router.use('/enforcers', enforcerRoutes);
router.use('/violation-types', violationTypeRoutes);
router.use('/citations', citationRoutes);
router.use('/notifications', notificationRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/chatbot', chatbotRoutes);
router.use('/audit-logs', auditLogRoutes);
router.use('/payments', paymentRoutes);

module.exports = router;
