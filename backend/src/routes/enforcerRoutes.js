const express = require('express');
const { body } = require('express-validator');
const enforcerController = require('../controllers/enforcerController');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/role');

const router = express.Router();

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
