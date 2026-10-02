const express = require('express');
const paymentController = require('../controllers/paymentController');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/role');

const router = express.Router();

// Phase 4.2: Xendit webhook (public — authorized by x-callback-token,
// never by user JWT) and the user-facing return page (settles nothing).
router.post('/webhook', paymentController.handleWebhook);
router.get('/return', paymentController.returnPage);

router.post(
  '/citations/:id/checkout',
  authenticate,
  allowRoles('driver'),
  paymentController.createCheckout
);

module.exports = router;
