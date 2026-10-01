const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const {
  sequelize,
  Citation,
  CitationViolation,
  Evidence,
  ViolationType,
  Driver,
  Enforcer,
} = require('../models');
const { generateCitationNumber } = require('../utils/citationNumber');
const { notifyDriver } = require('../services/notificationService');
const { logAdminAction } = require('../services/auditLogService');
const { success, fail } = require('../utils/response');
const { getPagination } = require('../utils/pagination');

const DUE_DAYS = parseInt(process.env.CITATION_DUE_DAYS, 10) || 15;

const citationIncludes = [
  { model: Driver, attributes: ['driverId', 'firstName', 'lastName', 'licenseNumber'] },
  { model: Enforcer, attributes: ['enforcerId', 'firstName', 'lastName', 'badgeNumber', 'station'] },
  {
    model: CitationViolation,
    as: 'violations',
    include: [{ model: ViolationType, as: 'violationType' }],
  },
  { model: Evidence, as: 'evidence' },
];

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    fail(res, 'Validation failed', 422, errors.array());
    return false;
  }
  return true;
}

function summarizeViolations(citation) {
  return (citation.violations || []).map((v) => v.violationType?.description).filter(Boolean).join(', ');
}

/** Removes just-uploaded evidence files when the DB transaction fails. */
function cleanupUploadedFiles(files) {
  if (!files || files.length === 0) return;
  for (const file of files) {
    try {
      const fullPath = file.path || path.join(__dirname, '..', '..', 'uploads', 'evidence', file.filename);
      if (fullPath && fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch {
      // Best-effort cleanup only — a leftover file is harmless next to a failed citation.
    }
  }
}

/**
 * POST /citations — enforcer submits the 4-step Issue Citation form.
 * multipart/form-data: text fields + up to 5 photo files under "photos".
 */
async function createCitation(req, res, next) {
  const t = await sequelize.transaction();

  try {
    if (!handleValidation(req, res)) {
      await t.rollback();
      cleanupUploadedFiles(req.files);
      return;
    }

    const {
      driverId,
      recordType,
      vehicleUnitType,
      plateNumber,
      registeredOwner,
      otherViolation,
      placeOfViolation,
      latitude,
      longitude,
      driverUnderProtest,
      address,
    } = req.body;

    // Only ACTIVE enforcers may issue citations/warnings. Login-time checks
    // are not enough (a JWT stays valid up to 8h), so the status is
    // re-checked here on every submission — never rely on frontend hiding.
    const issuer = await Enforcer.findByPk(req.user.id, { transaction: t });
    if (!issuer || issuer.status !== 'active') {
      await t.rollback();
      cleanupUploadedFiles(req.files);
      return fail(res, 'Only active enforcers may issue citations or warnings.', 403);
    }

    // 'violation' is a reserved record_type with no creation flow in Phase 1 —
    // only 'citation' and 'warning' can be issued.
    if (recordType && !['citation', 'warning'].includes(recordType)) {
      await t.rollback();
      cleanupUploadedFiles(req.files);
      return fail(res, "Unsupported record type. Only 'citation' and 'warning' can be issued.", 422);
    }

    const isWarning = recordType === 'warning';

    let violationTypeIds;
    try {
      violationTypeIds = JSON.parse(req.body.violationTypeIds || '[]');
    } catch {
      await t.rollback();
      cleanupUploadedFiles(req.files);
      return fail(res, 'violationTypeIds must be a valid JSON array of IDs', 422);
    }
    if (!Array.isArray(violationTypeIds) || violationTypeIds.length === 0) {
      await t.rollback();
      cleanupUploadedFiles(req.files);
      return fail(res, 'At least one violation type must be selected', 422);
    }

    const driver = await Driver.findByPk(driverId, { transaction: t });
    if (!driver) {
      await t.rollback();
      cleanupUploadedFiles(req.files);
      return fail(res, 'Driver not found', 404);
    }

    // The enforcer may correct the address during issuance — preserve it on
    // the driver record instead of silently discarding it.
    if (address && address.trim() && address.trim() !== driver.address) {
      driver.address = address.trim();
      await driver.save({ transaction: t });
    }

    const violationTypes = await ViolationType.findAll({
      where: { violationTypeId: violationTypeIds },
      transaction: t,
    });
    if (violationTypes.length !== violationTypeIds.length) {
      await t.rollback();
      cleanupUploadedFiles(req.files);
      return fail(res, 'One or more selected violation types were not found', 422);
    }

    // Warnings record which violations prompted them (for history/context)
    // but never carry a fine or a due date, per spec.
    const fineAmount = isWarning
      ? null
      : violationTypes.reduce((sum, vt) => sum + Number(vt.defaultPenalty), 0);
    const occurredAt = new Date();
    let dueDate = null;
    if (!isWarning) {
      dueDate = new Date(occurredAt);
      dueDate.setDate(dueDate.getDate() + DUE_DAYS);
    }

    let citationNumber = await generateCitationNumber(isWarning ? 'warning' : 'citation');

    const citationPayload = () => ({
      citationNumber,
      recordType: isWarning ? 'warning' : 'citation',
      driverId: driver.driverId,
      enforcerId: req.user.id,
      vehicleUnitType: String(vehicleUnitType).trim(),
      plateNumber: String(plateNumber).trim(),
      registeredOwner: String(registeredOwner).trim(),
      otherViolation: otherViolation || null,
      placeOfViolation,
      occurredAt,
      latitude: Number(latitude),
      longitude: Number(longitude),
      driverUnderProtest: driverUnderProtest === 'true' || driverUnderProtest === true,
      fineAmount,
      dueDate,
      settlementStatus: isWarning ? 'warning_only' : 'pending',
    });

    // Retry on citation-number collisions (two enforcers submitting at the
    // same second can generate the same count-based number). MySQL does not
    // abort the surrounding transaction on a single-statement unique error,
    // so regenerating the number and retrying inside the same tx is safe.
    // Up to 3 attempts before surfacing the error — no counter table.
    let citation;
    let attempts = 0;
    for (;;) {
      try {
        attempts += 1;
        citation = await Citation.create(citationPayload(), { transaction: t });
        break;
      } catch (createErr) {
        if (createErr.name === 'SequelizeUniqueConstraintError' && attempts < 3) {
          citationNumber = await generateCitationNumber(isWarning ? 'warning' : 'citation');
          continue;
        }
        throw createErr;
      }
    }

    await CitationViolation.bulkCreate(
      violationTypes.map((vt) => ({
        citationId: citation.citationId,
        violationTypeId: vt.violationTypeId,
        penaltyAtIssuance: vt.defaultPenalty,
      })),
      { transaction: t }
    );

    if (req.files && req.files.length > 0) {
      await Evidence.bulkCreate(
        req.files.map((file) => ({
          citationId: citation.citationId,
          imagePath: `/uploads/evidence/${file.filename}`,
        })),
        { transaction: t }
      );
    }

    const violationSummary = violationTypes.map((vt) => vt.description).join(', ');
    await notifyDriver(
      {
        driverId: driver.driverId,
        citationId: citation.citationId,
        message: isWarning
          ? `You have received a warning for ${violationSummary} at ${placeOfViolation}. No fine is due, but this is recorded on your driving history.`
          : `You have received a citation for ${violationSummary} at ${placeOfViolation}.`,
        notificationType: isWarning ? 'warning_issued' : 'citation_issued',
      },
      { transaction: t }
    );

    await t.commit();

    const fullCitation = await Citation.findByPk(citation.citationId, { include: citationIncludes });
    return success(res, fullCitation, 'Citation issued', 201);
  } catch (err) {
    await t.rollback();
    cleanupUploadedFiles(req.files);
    next(err);
  }
}

/** GET /citations/mine — enforcer's Previous Citations list */
async function listMyCitations(req, res, next) {
  try {
    const citations = await Citation.findAll({
      where: { enforcerId: req.user.id },
      include: citationIncludes,
      order: [['occurredAt', 'DESC']],
    });
    return success(res, citations);
  } catch (err) {
    next(err);
  }
}

/** GET /citations/driver/mine — driver's own "My Violations" list.
 * req.user.id is the driverId when the JWT role is 'driver'. */
async function listMyViolationsAsDriver(req, res, next) {
  try {
    const citations = await Citation.findAll({
      where: { driverId: req.user.id },
      include: citationIncludes,
      order: [['occurredAt', 'DESC']],
    });
    return success(res, citations);
  } catch (err) {
    next(err);
  }
}

/** GET /citations/:id */
async function getCitation(req, res, next) {
  try {
    const citation = await Citation.findByPk(req.params.id, { include: citationIncludes });
    if (!citation) return fail(res, 'Citation not found', 404);

    // A driver may only view their own citation, never someone else's.
    if (req.user.role === 'driver' && citation.driverId !== req.user.id) {
      return fail(res, 'You are not authorized to view this citation', 403);
    }

    return success(res, citation);
  } catch (err) {
    next(err);
  }
}

/** GET /drivers/:id/citations — violation history for a specific driver
 * (enforcer's Driver Record screen, admin's driver detail view). */
async function getDriverCitations(req, res, next) {
  try {
    const citations = await Citation.findAll({
      where: { driverId: req.params.id },
      include: citationIncludes,
      order: [['occurredAt', 'DESC']],
    });
    return success(res, citations);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /citations?search=&status=&recordType=&page=&limit=
 * Admin's Violation Monitoring list — all citations system-wide.
 * recordType=citation powers the Settlements page so warnings are excluded
 * server-side with correct pagination counts (never fetch-all-filter-client).
 */
async function listAllCitations(req, res, next) {
  try {
    const { page, limit } = getPagination(req.query, 10);
    const { search, status, recordType, underProtest } = req.query;

    const where = {};
    if (status) where.settlementStatus = status;
    if (recordType && ['citation', 'warning'].includes(recordType)) where.recordType = recordType;
    if (underProtest === 'true') where.driverUnderProtest = true;
    if (search) {
      where[Op.or] = [{ citationNumber: { [Op.like]: `%${search}%` } }];
    }

    const { rows, count } = await Citation.findAndCountAll({
      where,
      include: citationIncludes,
      limit,
      offset: (page - 1) * limit,
      order: [['occurredAt', 'DESC']],
      distinct: true, // needed for an accurate count() when joining hasMany associations
    });

    return success(res, {
      citations: rows,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    });
  } catch (err) {
    next(err);
  }
}

/** PATCH /citations/:id/verify — admin marks a citation as verified */
async function verifyCitation(req, res, next) {
  try {
    const citation = await Citation.findByPk(req.params.id);
    if (!citation) return fail(res, 'Citation not found', 404);

    citation.verified = true;
    await citation.save();

    logAdminAction(req.user.id, 'verified_citation', 'citation', citation.citationId, citation.citationNumber);
    return success(res, citation, 'Citation marked as verified');
  } catch (err) {
    next(err);
  }
}

/** PATCH /citations/:id/fine-amount — admin overrides the auto-computed total */
async function overrideFineAmount(req, res, next) {
  try {
    const { fineAmount, reason } = req.body;
    const parsedAmount = Number(fineAmount);
    if (fineAmount === undefined || !Number.isFinite(parsedAmount) || parsedAmount < 0 || parsedAmount > 99999999) {
      return fail(res, 'A valid fine amount between 0 and 99,999,999 is required', 422);
    }
    if (!reason || !reason.trim()) {
      return fail(res, 'A reason is required when overriding a fine amount', 422);
    }

    const citation = await Citation.findByPk(req.params.id);
    if (!citation) return fail(res, 'Citation not found', 404);
    if (citation.settlementStatus === 'warning_only' || citation.recordType === 'warning') {
      return fail(res, 'Warnings carry no fine and cannot be overridden', 409);
    }
    if (citation.settlementStatus !== 'pending') {
      return fail(res, `Cannot override the fine of a ${citation.settlementStatus} citation`, 409);
    }

    const previousAmount = citation.fineAmount;
    citation.fineAmount = Number(fineAmount);
    citation.fineOverrideReason = reason.trim();
    await citation.save();

    logAdminAction(
      req.user.id,
      'overrode_fine_amount',
      'citation',
      citation.citationId,
      `${citation.citationNumber}: ₱${previousAmount} → ₱${fineAmount} (${reason.trim()})`
    );
    return success(res, citation, 'Fine amount updated');
  } catch (err) {
    next(err);
  }
}

/** PATCH /citations/:id/settle — admin marks a citation as paid.
 * Only pending citations can be settled. Warnings (warning_only) carry no
 * fine and are never settled; settled/cancelled records are immutable.
 * Accepts optional { paymentMethod, paymentReference } for the receipt. */
async function settleCitation(req, res, next) {
  const t = await sequelize.transaction();
  try {
    // Row lock: two admins settling the same citation concurrently must not
    // both succeed — the loser gets a 409 when the status is re-checked.
    const citation = await Citation.findByPk(req.params.id, {
      include: citationIncludes,
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!citation) {
      await t.rollback();
      return fail(res, 'Citation not found', 404);
    }
    if (citation.settlementStatus !== 'pending') {
      await t.rollback();
      if (citation.settlementStatus === 'settled') {
        return fail(res, 'This citation is already settled', 409);
      }
      if (citation.settlementStatus === 'cancelled') {
        return fail(res, 'Cancelled citations cannot be settled', 409);
      }
      return fail(res, 'Warnings cannot be settled — no fine is due', 409);
    }

    const { paymentMethod, paymentReference } = req.body || {};
    if (paymentMethod && !['cash', 'gcash', 'maya', 'bank', 'other'].includes(paymentMethod)) {
      await t.rollback();
      return fail(res, 'Invalid payment method', 422);
    }

    citation.settlementStatus = 'settled';
    citation.settledAt = new Date();
    if (paymentMethod) citation.paymentMethod = paymentMethod;
    if (paymentReference) citation.paymentReference = String(paymentReference).trim() || null;
    citation.receivedBy = req.user?.id || null;
    await citation.save({ transaction: t });

    await notifyDriver(
      {
        driverId: citation.driverId,
        citationId: citation.citationId,
        message: `Your payment for citation ${citation.citationNumber} has been processed successfully.`,
        notificationType: 'settlement_confirmed',
      },
      { transaction: t }
    );

    await t.commit();
    logAdminAction(req.user.id, 'settled_citation', 'citation', citation.citationId, citation.citationNumber);
    return success(res, citation, 'Citation marked as settled');
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

/** PATCH /citations/:id/cancel — admin voids a citation issued in error.
 * Only pending citations can be cancelled. Settled records stay settled
 * (they represent money already taken); warnings are history-only and are
 * never cancelled. Cancellation is NOT a settlement, so the driver is
 * notified with the existing 'follow_up' type and explicit cancellation
 * wording (no schema change). */
async function cancelCitation(req, res, next) {
  try {
    const citation = await Citation.findByPk(req.params.id);
    if (!citation) return fail(res, 'Citation not found', 404);
    if (citation.settlementStatus !== 'pending') {
      if (citation.settlementStatus === 'cancelled') {
        return fail(res, 'This citation is already cancelled', 409);
      }
      if (citation.settlementStatus === 'settled') {
        return fail(res, 'Settled citations cannot be cancelled', 409);
      }
      return fail(res, 'Warnings cannot be cancelled', 409);
    }

    citation.settlementStatus = 'cancelled';
    await citation.save();

    await notifyDriver({
      driverId: citation.driverId,
      citationId: citation.citationId,
      message: `Cancellation Notice — Citation ${citation.citationNumber} has been cancelled. No settlement is required.`,
      notificationType: 'follow_up',
    });

    logAdminAction(req.user.id, 'cancelled_citation', 'citation', citation.citationId, citation.citationNumber);
    return success(res, citation, 'Citation cancelled');
  } catch (err) {
    next(err);
  }
}

/** PATCH /citations/:id/protest — admin resolves a driver protest.
 *  { action: 'dismiss' } clears the protest flag (citation stands).
 *  { action: 'uphold' } cancels the citation in the driver's favor. */
async function resolveProtest(req, res, next) {
  try {
    const { action } = req.body;
    if (!['dismiss', 'uphold'].includes(action)) {
      return fail(res, 'Action must be dismiss or uphold', 422);
    }
    const citation = await Citation.findByPk(req.params.id);
    if (!citation) return fail(res, 'Citation not found', 404);
    if (!citation.driverUnderProtest) return fail(res, 'This citation is not under protest', 409);

    // Settlement/history integrity: a settled citation represents money
    // already taken and must never flip to cancelled via protest. Only
    // pending citations can be upheld (cancelled); dismiss is allowed for
    // pending or settled records but never for already-cancelled ones.
    if (action === 'uphold' && citation.settlementStatus !== 'pending') {
      return fail(res, 'Only unsettled citations can be cancelled through protest. Settled records stay settled.', 409);
    }
    if (action === 'dismiss' && citation.settlementStatus === 'cancelled') {
      return fail(res, 'This citation is already cancelled', 409);
    }

    if (action === 'dismiss') {
      citation.driverUnderProtest = false;
      await citation.save();
      await notifyDriver({
        driverId: citation.driverId,
        citationId: citation.citationId,
        message: `Your protest for citation ${citation.citationNumber} was reviewed and dismissed. The citation stands.`,
        notificationType: 'follow_up',
      });
      logAdminAction(req.user.id, 'dismissed_protest', 'citation', citation.citationId, citation.citationNumber);
      return success(res, citation, 'Protest dismissed');
    }

    citation.driverUnderProtest = false;
    citation.settlementStatus = 'cancelled';
    await citation.save();
    await notifyDriver({
      driverId: citation.driverId,
      citationId: citation.citationId,
      message: `Your protest for citation ${citation.citationNumber} was upheld. The citation has been cancelled.`,
      notificationType: 'follow_up',
    });
    logAdminAction(req.user.id, 'upheld_protest', 'citation', citation.citationId, citation.citationNumber);
    return success(res, citation, 'Protest upheld — citation cancelled');
  } catch (err) {
    next(err);
  }
}

/** PATCH /citations/:id/remind — admin sends a one-off payment reminder for this citation */async function sendReminder(req, res, next) {
  try {
    const citation = await Citation.findByPk(req.params.id);
    if (!citation) return fail(res, 'Citation not found', 404);
    if (citation.settlementStatus !== 'pending') {
      return fail(res, 'Reminders can only be sent for unsettled citations', 409);
    }

    await notifyDriver({
      driverId: citation.driverId,
      citationId: citation.citationId,
      message: `Your citation ${citation.citationNumber} is due for settlement. Fine: ₱${Number(citation.fineAmount).toLocaleString()}`,
      notificationType: 'payment_reminder',
    });

    logAdminAction(req.user.id, 'sent_reminder', 'citation', citation.citationId, citation.citationNumber);
    return success(res, null, 'Reminder sent');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createCitation,
  listMyCitations,
  listMyViolationsAsDriver,
  getCitation,
  getDriverCitations,
  listAllCitations,
  verifyCitation,
  overrideFineAmount,
  settleCitation,
  cancelCitation,
  sendReminder,
  resolveProtest,
};
