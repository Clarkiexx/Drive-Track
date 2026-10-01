const express = require('express');
const { body } = require('express-validator');
const violationTypeController = require('../controllers/violationTypeController');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/role');

const router = express.Router();

router.use(authenticate); // any logged-in role (driver/enforcer/admin) can read

router.get('/', violationTypeController.listViolationTypes);

const validateBody = [
  body('articleSection').trim().notEmpty().withMessage('Article/Section is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('category').isIn(['moving', 'non_moving']).withMessage('Category must be moving or non_moving'),
  body('defaultPenalty').isFloat({ min: 0 }).withMessage('Default penalty must be a positive number'),
];

router.post('/', allowRoles('admin'), validateBody, violationTypeController.createViolationType);

// PATCH validates only the fields actually sent (all optional), so partial
// updates can't sneak in a negative penalty that would corrupt the
// server-side fine calculation for future citations.
const validatePatchBody = [
  body('articleSection').optional().trim().notEmpty().withMessage('Article/Section cannot be empty'),
  body('description').optional().trim().notEmpty().withMessage('Description cannot be empty'),
  body('category').optional().isIn(['moving', 'non_moving']).withMessage('Category must be moving or non_moving'),
  body('defaultPenalty').optional().isFloat({ min: 0 }).withMessage('Default penalty must be a positive number'),
];

router.patch('/:id', allowRoles('admin'), validatePatchBody, violationTypeController.updateViolationType);
router.patch('/:id/status', allowRoles('admin'), violationTypeController.updateViolationTypeStatus);

module.exports = router;
