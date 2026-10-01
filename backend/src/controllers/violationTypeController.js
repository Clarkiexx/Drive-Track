const { validationResult } = require('express-validator');
const { ViolationType } = require('../models');
const { success, fail } = require('../utils/response');
const { logAdminAction } = require('../services/auditLogService');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    fail(res, 'Validation failed', 422, errors.array());
    return false;
  }
  return true;
}

/**
 * GET /violation-types?active=true
 * All authenticated roles can read this list. Admin's management page
 * requests the full list (including inactive); the Enforcer's Issue
 * Citation screen requests ?active=true so retired violation types
 * don't show up as selectable for new citations.
 */
async function listViolationTypes(req, res, next) {
  try {
    const where = {};
    if (req.query.active === 'true') where.isActive = true;

    const violationTypes = await ViolationType.findAll({
      where,
      order: [['articleSection', 'ASC']],
    });

    return success(res, violationTypes);
  } catch (err) {
    next(err);
  }
}

async function createViolationType(req, res, next) {
  try {
    if (!handleValidation(req, res)) return;

    const { articleSection, description, category, defaultPenalty } = req.body;

    const violationType = await ViolationType.create({
      articleSection,
      description,
      category,
      defaultPenalty,
      isActive: true,
    });

    logAdminAction(req.user.id, 'created_violation_type', 'violation_type', violationType.violationTypeId, description);
    return success(res, violationType, 'Violation type created', 201);
  } catch (err) {
    next(err);
  }
}

async function updateViolationType(req, res, next) {
  try {
    if (!handleValidation(req, res)) return;

    const violationType = await ViolationType.findByPk(req.params.id);
    if (!violationType) return fail(res, 'Violation type not found', 404);

    const { articleSection, description, category, defaultPenalty } = req.body;
    if (articleSection !== undefined) violationType.articleSection = articleSection;
    if (description !== undefined) violationType.description = description;
    if (category !== undefined) violationType.category = category;
    if (defaultPenalty !== undefined) violationType.defaultPenalty = defaultPenalty;

    await violationType.save();

    // Note: this only affects citations issued AFTER this change.
    // Past citations keep their penalty_at_issuance snapshot (Module 4).
    logAdminAction(req.user.id, 'updated_violation_type', 'violation_type', violationType.violationTypeId, violationType.description);
    return success(res, violationType, 'Violation type updated');
  } catch (err) {
    next(err);
  }
}

/** PATCH /violation-types/:id/status — activate/deactivate, never hard-delete */
async function updateViolationTypeStatus(req, res, next) {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return fail(res, 'isActive must be true or false', 422);
    }

    const violationType = await ViolationType.findByPk(req.params.id);
    if (!violationType) return fail(res, 'Violation type not found', 404);

    violationType.isActive = isActive;
    await violationType.save();

    logAdminAction(
      req.user.id,
      isActive ? 'activated_violation_type' : 'deactivated_violation_type',
      'violation_type',
      violationType.violationTypeId,
      violationType.description
    );
    return success(res, violationType, isActive ? 'Violation type activated' : 'Violation type deactivated');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listViolationTypes,
  createViolationType,
  updateViolationType,
  updateViolationTypeStatus,
};
