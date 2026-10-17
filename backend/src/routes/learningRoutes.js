const express = require('express');
const { body } = require('express-validator');
const learningController = require('../controllers/learningController');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/role');

const router = express.Router();

// Any logged-in role (driver/enforcer/admin) can read the catalogue + quiz.
router.use(authenticate);

/**
 * The sign vocabulary the driver UI can draw — kept in lockstep with
 * frontend/data/trafficSigns.ts (SIGN_CATEGORIES / SIGN_SHAPES /
 * SIGN_GLYPHS) and SignShape.tsx. A row outside these lists could never be
 * rendered, so the API refuses it up front.
 */
const SIGN_CATEGORIES = ['Regulatory', 'Warning', 'Informational'];
const SIGN_SHAPES = ['octagon', 'circle', 'triangle', 'rectangle', 'inverted-triangle'];
const SIGN_GLYPHS = [
  'stop-text',
  'yield-text',
  'bar',
  'letter-p',
  'letter-h',
  'speed-100',
  'arrow-up',
  'arrow-left',
  'arrow-right',
  'u-turn',
  'two-cars',
  'horn',
  'pedestrian',
  'school',
  'car',
  'bike',
  'phone',
  'cigarette',
  'pump',
  'dim-width',
  'dim-height',
  'dim-load',
  'w-arrow-left',
  'w-arrow-right',
  'w-keep-left',
  'w-keep-right',
  'w-pass-either',
  'lights',
  'roundabout',
  'narrow',
  'hump',
  'cross',
  't-junction',
  'side-right',
  'side-left',
  'bend-left',
  'bend-right',
  'slope-down',
  'slope-up',
  'merge',
  'rails',
  'bridge',
  'rocks',
  'barricade',
  'handset',
  'rest',
  'police',
  'train',
  'utensils',
  'plane',
  'anchor',
  'med-star',
  'bus',
  'park-ride',
  'area-closed',
  'skid',
  'curve',
  'cycle-lane',
];
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/* --- Signs ---------------------------------------------------------------- */

router.get('/signs', learningController.listSigns);

const signBody = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }),
  body('category').isIn(SIGN_CATEGORIES).withMessage('Category must be Regulatory, Warning or Informational'),
  body('shape').isIn(SIGN_SHAPES).withMessage('Unknown sign shape'),
  body('glyph').isIn(SIGN_GLYPHS).withMessage('Unknown sign glyph'),
  body('color').matches(HEX_COLOR).withMessage('Color must be a 6-digit hex value like #DC2626'),
  body('meaning').trim().notEmpty().withMessage('Meaning is required').isLength({ max: 600 }),
  body('prohibited').optional().isBoolean().withMessage('prohibited must be true or false'),
  body('solid').optional().isBoolean().withMessage('solid must be true or false'),
  body('sortOrder')
    .optional({ values: 'null' })
    .isInt({ min: 0, max: 9999 })
    .withMessage('Sort order must be an integer between 0 and 9999'),
];

router.post('/signs', allowRoles('admin'), signBody, learningController.createSign);

const signPatchBody = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty').isLength({ max: 120 }),
  body('category').optional().isIn(SIGN_CATEGORIES).withMessage('Category must be Regulatory, Warning or Informational'),
  body('shape').optional().isIn(SIGN_SHAPES).withMessage('Unknown sign shape'),
  body('glyph').optional().isIn(SIGN_GLYPHS).withMessage('Unknown sign glyph'),
  body('color').optional().matches(HEX_COLOR).withMessage('Color must be a 6-digit hex value like #DC2626'),
  body('meaning').optional().trim().notEmpty().withMessage('Meaning cannot be empty').isLength({ max: 600 }),
  body('prohibited').optional().isBoolean().withMessage('prohibited must be true or false'),
  body('solid').optional().isBoolean().withMessage('solid must be true or false'),
  body('sortOrder')
    .optional({ values: 'null' })
    .isInt({ min: 0, max: 9999 })
    .withMessage('Sort order must be an integer between 0 and 9999'),
];

router.patch('/signs/:id', allowRoles('admin'), signPatchBody, learningController.updateSign);
router.patch('/signs/:id/status', allowRoles('admin'), learningController.updateSignStatus);

/* --- Quiz ----------------------------------------------------------------- */

router.get('/quiz', learningController.listQuiz);

const quizBody = [
  body('signId').trim().notEmpty().withMessage('A sign is required'),
  body('question').trim().notEmpty().withMessage('Question is required').isLength({ max: 300 }),
  body('options')
    .isArray({ min: 4, max: 4 })
    .withMessage('Exactly 4 answer options are required'),
  body('options.*').trim().notEmpty().withMessage('Answer options cannot be empty'),
  body('correctIndex')
    .isInt({ min: 0, max: 3 })
    .withMessage('The correct answer must be option 1-4'),
];

router.post('/quiz', allowRoles('admin'), quizBody, learningController.createQuizQuestion);

const quizPatchBody = [
  body('signId').optional().trim().notEmpty().withMessage('A sign is required'),
  body('question').optional().trim().notEmpty().withMessage('Question cannot be empty').isLength({ max: 300 }),
  body('options')
    .optional()
    .isArray({ min: 4, max: 4 })
    .withMessage('Exactly 4 answer options are required'),
  body('options.*').trim().notEmpty().withMessage('Answer options cannot be empty'),
  body('correctIndex')
    .optional()
    .isInt({ min: 0, max: 3 })
    .withMessage('The correct answer must be option 1-4'),
];

router.patch('/quiz/:id', allowRoles('admin'), quizPatchBody, learningController.updateQuizQuestion);
router.patch('/quiz/:id/status', allowRoles('admin'), learningController.updateQuizQuestionStatus);

module.exports = router;
