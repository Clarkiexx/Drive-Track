const { validationResult } = require('express-validator');
const { success, fail } = require('../utils/response');
const { logAdminAction } = require('../services/auditLogService');

// Shared Prisma data layer — src/lib/prisma.js is the single place the client
// and the error/date/number helpers come from (owned by the foundation lane).
const { prisma, prismaErrorToHttp, toDateOnlyString, toNumber } = require('../lib/prisma');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    fail(res, 'Validation failed', 422, errors.array());
    return false;
  }
  return true;
}

/** :id params are not validated by the routes, so a non-numeric id has to
 *  keep behaving like Sequelize's findByPk did (null → 404) instead of
 *  making Prisma throw a client-validation error. */
function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Legal-range guard for the displayed penalty band: when a min/max band is
 * present, min must not exceed max and the charged default must sit inside
 * it. Values may arrive as strings (multipart/JSON) — compare numerically.
 * Returns a message or null. `def` is the merged default (body or existing).
 */
function penaltyRangeError({ min, max, def }) {
  const hasMin = min !== undefined && min !== null && min !== '';
  const hasMax = max !== undefined && max !== null && max !== '';
  const hasDef = def !== undefined && def !== null && def !== '';
  if (hasMin && hasMax && Number(min) > Number(max)) {
    return 'Minimum penalty cannot exceed maximum penalty';
  }
  if (hasMin && hasDef && Number(def) < Number(min)) {
    return 'Default penalty cannot be below the minimum penalty';
  }
  if (hasMax && hasDef && Number(def) > Number(max)) {
    return 'Default penalty cannot exceed the maximum penalty';
  }
  return null;
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

    const violationTypes = await prisma.violationType.findMany({
      where,
      orderBy: { articleSection: 'asc' },
    });

    return success(res, violationTypes);
  } catch (err) {
    next(err);
  }
}

async function createViolationType(req, res, next) {
  try {
    if (!handleValidation(req, res)) return;

    const { articleSection, description, category, defaultPenalty, minPenalty, maxPenalty } = req.body;

    const rangeError = penaltyRangeError({ min: minPenalty, max: maxPenalty, def: defaultPenalty });
    if (rangeError) return fail(res, rangeError, 422);

    const violationType = await prisma.violationType.create({
      data: {
        articleSection,
        description,
        category,
        defaultPenalty,
        minPenalty: minPenalty ?? null,
        maxPenalty: maxPenalty ?? null,
        isActive: true,
      },
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

    const violationTypeId = parseId(req.params.id);
    const existing =
      violationTypeId === null ? null : await prisma.violationType.findUnique({ where: { violationTypeId } });
    if (!existing) return fail(res, 'Violation type not found', 404);

    const { articleSection, description, category, defaultPenalty, minPenalty, maxPenalty } = req.body;
    const data = {};
    if (articleSection !== undefined) data.articleSection = articleSection;
    if (description !== undefined) data.description = description;
    if (category !== undefined) data.category = category;
    if (defaultPenalty !== undefined) data.defaultPenalty = defaultPenalty;
    if (minPenalty !== undefined) data.minPenalty = minPenalty;
    if (maxPenalty !== undefined) data.maxPenalty = maxPenalty;

    // Range check runs against merged (post-patch) values so a default-only
    // edit on a ranged row — or a range-only edit — is still validated.
    const rangeError = penaltyRangeError({
      min: data.minPenalty !== undefined ? data.minPenalty : existing.minPenalty,
      max: data.maxPenalty !== undefined ? data.maxPenalty : existing.maxPenalty,
      def: data.defaultPenalty !== undefined ? data.defaultPenalty : existing.defaultPenalty,
    });
    if (rangeError) return fail(res, rangeError, 422);

    // Sequelize's save() skipped the query when nothing was dirty — mirror
    // that instead of sending an empty UPDATE.
    const violationType =
      Object.keys(data).length > 0
        ? await prisma.violationType.update({ where: { violationTypeId }, data })
        : existing;

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

    const violationTypeId = parseId(req.params.id);
    const existing =
      violationTypeId === null ? null : await prisma.violationType.findUnique({ where: { violationTypeId } });
    if (!existing) return fail(res, 'Violation type not found', 404);

    const violationType = await prisma.violationType.update({
      where: { violationTypeId },
      data: { isActive },
    });

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
