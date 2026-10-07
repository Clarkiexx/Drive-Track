const { validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');
const { generateCitationNumber } = require('../utils/citationNumber');
const { notifyDriver } = require('../services/notificationService');
const { logAdminAction } = require('../services/auditLogService');
const { success, fail } = require('../utils/response');
const { getPagination } = require('../utils/pagination');

// Shared Prisma data layer — src/lib/prisma.js is the single place the client
// and the error/date/number helpers come from (owned by the foundation lane).
const { prisma, prismaErrorToHttp, toDateOnlyString, toNumber } = require('../lib/prisma');

const DUE_DAYS = parseInt(process.env.CITATION_DUE_DAYS, 10) || 15;

/** settlement_status members (prisma/schema.prisma) — used to keep an
 *  unknown ?status= filter answering an empty page, the way MySQL's ENUM
 *  comparison did, instead of letting Prisma reject the query. */
const SETTLEMENT_STATUSES = ['pending', 'settled', 'cancelled', 'warning_only'];

/** The include graph every citation response has always carried: driver and
 *  enforcer come back attribute-limited, violations nest their violation
 *  type, and evidence hangs off the same keys the frontend unwraps. */
const citationInclude = {
  driver: {
    select: { driverId: true, firstName: true, lastName: true, licenseNumber: true },
  },
  enforcer: {
    select: { enforcerId: true, firstName: true, lastName: true, badgeNumber: true, station: true },
  },
  violations: { include: { violationType: true } },
  evidence: true,
};

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

/** :id params are not validated by the routes, so a non-numeric id has to
 *  keep behaving like Sequelize's findByPk did (null → 404 / empty list)
 *  instead of making Prisma throw a client-validation error. */
function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** DATEONLY (citations.due_date) has always reached clients as 'YYYY-MM-DD'
 *  — Sequelize DATEONLY over MySQL. Prisma hands back a Date, so re-format it
 *  on the way out; every other column serializes unchanged. */
function serializeCitation(citation) {
  if (!citation) return citation;
  return { ...citation, dueDate: citation.dueDate ? toDateOnlyString(citation.dueDate) : citation.dueDate };
}

function serializeCitations(citations) {
  return (citations || []).map(serializeCitation);
}

/**
 * Postgres unique violation (P2002) → the canonical 409 body via the shared
 * lib's mapper (the successor of SequelizeUniqueConstraintError, with
 * P2002 meta.target standing in for err.errors[].path). Same envelope the
 * central errorHandler produces, so the client cannot tell which layer
 * answered.
 */
function sendDuplicateKeyConflict(res, err) {
  const mapped = prismaErrorToHttp(err);
  return fail(res, mapped.message, mapped.status, mapped.errors);
}

/**
 * POST /citations — enforcer submits the 4-step Issue Citation form.
 * multipart/form-data: text fields + up to 5 photo files under "photos".
 */
async function createCitation(req, res, next) {
  try {
    if (!handleValidation(req, res)) {
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
    const issuerId = parseId(req.user.id);
    const issuer =
      issuerId === null ? null : await prisma.enforcer.findUnique({ where: { enforcerId: issuerId } });
    if (!issuer || issuer.status !== 'active') {
      cleanupUploadedFiles(req.files);
      return fail(res, 'Only active enforcers may issue citations or warnings.', 403);
    }

    // 'violation' is a reserved record_type with no creation flow in Phase 1 —
    // only 'citation' and 'warning' can be issued.
    if (recordType && !['citation', 'warning'].includes(recordType)) {
      cleanupUploadedFiles(req.files);
      return fail(res, "Unsupported record type. Only 'citation' and 'warning' can be issued.", 422);
    }

    const isWarning = recordType === 'warning';

    let violationTypeIds;
    try {
      violationTypeIds = JSON.parse(req.body.violationTypeIds || '[]');
    } catch {
      cleanupUploadedFiles(req.files);
      return fail(res, 'violationTypeIds must be a valid JSON array of IDs', 422);
    }
    if (!Array.isArray(violationTypeIds) || violationTypeIds.length === 0) {
      cleanupUploadedFiles(req.files);
      return fail(res, 'At least one violation type must be selected', 422);
    }

    const driverPk = parseId(driverId);
    const driver = driverPk === null ? null : await prisma.driver.findUnique({ where: { driverId: driverPk } });
    if (!driver) {
      cleanupUploadedFiles(req.files);
      return fail(res, 'Driver not found', 404);
    }

    // Prisma needs real integers here; a non-numeric id can never match a row,
    // which is the same 422 Sequelize's findAll produced for it.
    const violationTypePk = violationTypeIds.map(Number);
    if (violationTypePk.some((id) => !Number.isInteger(id) || id <= 0)) {
      cleanupUploadedFiles(req.files);
      return fail(res, 'One or more selected violation types were not found', 422);
    }
    const violationTypes = await prisma.violationType.findMany({
      where: { violationTypeId: { in: violationTypePk } },
    });
    if (violationTypes.length !== violationTypeIds.length) {
      cleanupUploadedFiles(req.files);
      return fail(res, 'One or more selected violation types were not found', 422);
    }

    // The enforcer may correct the address during issuance — preserve it on
    // the driver record instead of silently discarding it. The write itself
    // happens inside the transaction below, so a failed submission still
    // leaves the driver untouched, exactly as the old rollback did.
    const correctedAddress = address && address.trim() ? address.trim() : null;
    const addressChanged = Boolean(correctedAddress && correctedAddress !== driver.address);

    // Warnings record which violations prompted them (for history/context)
    // but never carry a fine or a due date, per spec.
    const fineAmount = isWarning
      ? null
      : violationTypes.reduce((sum, vt) => sum + (toNumber(vt.defaultPenalty) || 0), 0);
    const occurredAt = new Date();
    let dueDate = null;
    if (!isWarning) {
      dueDate = new Date(occurredAt);
      dueDate.setDate(dueDate.getDate() + DUE_DAYS);
    }

    const recordTypeValue = isWarning ? 'warning' : 'citation';
    const violationSummary = violationTypes.map((vt) => vt.description).join(', ');

    // Retry on citation-number collisions (two enforcers submitting at the
    // same second can generate the same count-based number). The retry lives
    // OUTSIDE the transaction on purpose: on Postgres a P2002 aborts the whole
    // open transaction, so the number must be regenerated and a *fresh*
    // transaction started. MySQL tolerated regenerating it inside the same
    // tx; Neon does not. Up to 3 attempts before surfacing the error.
    const MAX_ATTEMPTS = 3;
    let citationId;

    for (let attempt = 1; ; attempt += 1) {
      try {
        const citationNumber = await generateCitationNumber(recordTypeValue);

        citationId = await prisma.$transaction(async (tx) => {
          if (addressChanged) {
            await tx.driver.update({
              where: { driverId: driver.driverId },
              data: { address: correctedAddress },
            });
          }

          const citation = await tx.citation.create({
            data: {
              citationNumber,
              recordType: recordTypeValue,
              driverId: driver.driverId,
              enforcerId: Number(req.user.id),
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
            },
          });

          await tx.citationViolation.createMany({
            data: violationTypes.map((vt) => ({
              citationId: citation.citationId,
              violationTypeId: vt.violationTypeId,
              penaltyAtIssuance: vt.defaultPenalty,
            })),
          });

          if (req.files && req.files.length > 0) {
            await tx.evidence.createMany({
              data: req.files.map((file) => ({
                citationId: citation.citationId,
                imagePath: `/uploads/evidence/${file.filename}`,
              })),
            });
          }

          await notifyDriver(
            {
              driverId: driver.driverId,
              citationId: citation.citationId,
              message: isWarning
                ? `You have received a warning for ${violationSummary} at ${placeOfViolation}. No fine is due, but this is recorded on your driving history.`
                : `You have received a citation for ${violationSummary} at ${placeOfViolation}.`,
              notificationType: isWarning ? 'warning_issued' : 'citation_issued',
            },
            { transaction: tx }
          );

          return citation.citationId;
        });

        break;
      } catch (createErr) {
        if (createErr && createErr.code === 'P2002' && attempt < MAX_ATTEMPTS) continue;
        throw createErr;
      }
    }

    const fullCitation = await prisma.citation.findUnique({
      where: { citationId },
      include: citationInclude,
    });
    return success(res, serializeCitation(fullCitation), 'Citation issued', 201);
  } catch (err) {
    cleanupUploadedFiles(req.files);
    if (err && err.code === 'P2002') return sendDuplicateKeyConflict(res, err);
    next(err);
  }
}

/** GET /citations/mine — enforcer's Previous Citations list */
async function listMyCitations(req, res, next) {
  try {
    const citations = await prisma.citation.findMany({
      where: { enforcerId: Number(req.user.id) },
      include: citationInclude,
      orderBy: { occurredAt: 'desc' },
    });
    return success(res, serializeCitations(citations));
  } catch (err) {
    next(err);
  }
}

/** GET /citations/driver/mine — driver's own "My Violations" list.
 * req.user.id is the driverId when the JWT role is 'driver'. */
async function listMyViolationsAsDriver(req, res, next) {
  try {
    const citations = await prisma.citation.findMany({
      where: { driverId: Number(req.user.id) },
      include: citationInclude,
      orderBy: { occurredAt: 'desc' },
    });
    return success(res, serializeCitations(citations));
  } catch (err) {
    next(err);
  }
}

/** GET /citations/:id */
async function getCitation(req, res, next) {
  try {
    const citationId = parseId(req.params.id);
    const citation =
      citationId === null
        ? null
        : await prisma.citation.findUnique({ where: { citationId }, include: citationInclude });
    if (!citation) return fail(res, 'Citation not found', 404);

    // A driver may only view their own citation, never someone else's.
    if (req.user.role === 'driver' && citation.driverId !== req.user.id) {
      return fail(res, 'You are not authorized to view this citation', 403);
    }

    return success(res, serializeCitation(citation));
  } catch (err) {
    next(err);
  }
}

/** GET /drivers/:id/citations — violation history for a specific driver
 * (enforcer's Driver Record screen, admin's driver detail view). */
async function getDriverCitations(req, res, next) {
  try {
    const driverId = parseId(req.params.id);
    const citations =
      driverId === null
        ? [] // MySQL cast an unmatchable id to 0 and returned no rows.
        : await prisma.citation.findMany({
            where: { driverId },
            include: citationInclude,
            orderBy: { occurredAt: 'desc' },
          });
    return success(res, serializeCitations(citations));
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

    // Every filter is scalar, so findMany and count() agree on the total —
    // the old findAndCountAll({ distinct: true }) is count() + findMany here.
    const where = {};
    if (status) {
      if (!SETTLEMENT_STATUSES.includes(status)) {
        // MySQL compared the value against the ENUM and matched no rows;
        // Prisma would reject the query outright, so answer that empty page.
        return success(res, {
          citations: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
        });
      }
      where.settlementStatus = status;
    }
    if (recordType && ['citation', 'warning'].includes(recordType)) where.recordType = recordType;
    if (underProtest === 'true') where.driverUnderProtest = true;
    if (search) {
      where.citationNumber = { contains: search, mode: 'insensitive' };
    }

    const [total, rows] = await Promise.all([
      prisma.citation.count({ where }),
      prisma.citation.findMany({
        where,
        include: citationInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { occurredAt: 'desc' },
      }),
    ]);

    return success(res, {
      citations: serializeCitations(rows),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

/** PATCH /citations/:id/verify — admin marks a citation as verified */
async function verifyCitation(req, res, next) {
  try {
    const citationId = parseId(req.params.id);
    const citation =
      citationId === null ? null : await prisma.citation.findUnique({ where: { citationId } });
    if (!citation) return fail(res, 'Citation not found', 404);

    const updated = await prisma.citation.update({
      where: { citationId },
      data: { verified: true },
    });

    logAdminAction(req.user.id, 'verified_citation', 'citation', citationId, citation.citationNumber);
    return success(res, serializeCitation(updated), 'Citation marked as verified');
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

    const citationId = parseId(req.params.id);
    const citation =
      citationId === null ? null : await prisma.citation.findUnique({ where: { citationId } });
    if (!citation) return fail(res, 'Citation not found', 404);
    if (citation.settlementStatus === 'warning_only' || citation.recordType === 'warning') {
      return fail(res, 'Warnings carry no fine and cannot be overridden', 409);
    }
    if (citation.settlementStatus !== 'pending') {
      return fail(res, `Cannot override the fine of a ${citation.settlementStatus} citation`, 409);
    }

    const previousAmount = citation.fineAmount;
    const updated = await prisma.citation.update({
      where: { citationId },
      data: {
        fineAmount: parsedAmount,
        fineOverrideReason: reason.trim(),
      },
    });

    logAdminAction(
      req.user.id,
      'overrode_fine_amount',
      'citation',
      citationId,
      `${citation.citationNumber}: ₱${previousAmount} → ₱${fineAmount} (${reason.trim()})`
    );
    return success(res, serializeCitation(updated), 'Fine amount updated');
  } catch (err) {
    next(err);
  }
}

/** PATCH /citations/:id/settle — admin marks a citation as paid.
 * Only pending citations can be settled. Warnings (warning_only) carry no
 * fine and are never settled; settled/cancelled records are immutable.
 * Accepts optional { paymentMethod, paymentReference } for the receipt. */
async function settleCitation(req, res, next) {
  try {
    const citationId = parseId(req.params.id);
    const citation =
      citationId === null
        ? null
        : await prisma.citation.findUnique({ where: { citationId }, include: citationInclude });
    if (!citation) return fail(res, 'Citation not found', 404);
    if (citation.settlementStatus !== 'pending') {
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
      return fail(res, 'Invalid payment method', 422);
    }

    const data = {
      settlementStatus: 'settled',
      settledAt: new Date(),
      receivedBy: req.user?.id || null,
    };
    if (paymentMethod) data.paymentMethod = paymentMethod;
    if (paymentReference) data.paymentReference = String(paymentReference).trim() || null;

    // No FOR UPDATE in Prisma — the status filter on this conditional update
    // IS the lock: of two concurrent settles only the first one matches
    // settlementStatus='pending', the loser sees count 0 and re-reads the row
    // for the same 409 the row lock used to produce.
    const settled = await prisma.$transaction(async (tx) => {
      const result = await tx.citation.updateMany({
        where: { citationId, settlementStatus: 'pending' },
        data,
      });
      if (result.count === 0) return false;

      await notifyDriver(
        {
          driverId: citation.driverId,
          citationId,
          message: `Your payment for citation ${citation.citationNumber} has been processed successfully.`,
          notificationType: 'settlement_confirmed',
        },
        { transaction: tx }
      );
      return true;
    });

    if (!settled) {
      const current = await prisma.citation.findUnique({
        where: { citationId },
        select: { settlementStatus: true },
      });
      if (!current) return fail(res, 'Citation not found', 404);
      if (current.settlementStatus === 'settled') {
        return fail(res, 'This citation is already settled', 409);
      }
      if (current.settlementStatus === 'cancelled') {
        return fail(res, 'Cancelled citations cannot be settled', 409);
      }
      return fail(res, 'Warnings cannot be settled — no fine is due', 409);
    }

    const updated = await prisma.citation.findUnique({
      where: { citationId },
      include: citationInclude,
    });
    logAdminAction(req.user.id, 'settled_citation', 'citation', citationId, citation.citationNumber);
    return success(res, serializeCitation(updated), 'Citation marked as settled');
  } catch (err) {
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
    const citationId = parseId(req.params.id);
    const citation =
      citationId === null ? null : await prisma.citation.findUnique({ where: { citationId } });
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

    const updated = await prisma.citation.update({
      where: { citationId },
      data: { settlementStatus: 'cancelled' },
    });

    await notifyDriver({
      driverId: citation.driverId,
      citationId,
      message: `Cancellation Notice — Citation ${citation.citationNumber} has been cancelled. No settlement is required.`,
      notificationType: 'follow_up',
    });

    logAdminAction(req.user.id, 'cancelled_citation', 'citation', citationId, citation.citationNumber);
    return success(res, serializeCitation(updated), 'Citation cancelled');
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
    const citationId = parseId(req.params.id);
    const citation =
      citationId === null ? null : await prisma.citation.findUnique({ where: { citationId } });
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
      const updated = await prisma.citation.update({
        where: { citationId },
        data: { driverUnderProtest: false },
      });
      await notifyDriver({
        driverId: citation.driverId,
        citationId,
        message: `Your protest for citation ${citation.citationNumber} was reviewed and dismissed. The citation stands.`,
        notificationType: 'follow_up',
      });
      logAdminAction(req.user.id, 'dismissed_protest', 'citation', citationId, citation.citationNumber);
      return success(res, serializeCitation(updated), 'Protest dismissed');
    }

    const updated = await prisma.citation.update({
      where: { citationId },
      data: { driverUnderProtest: false, settlementStatus: 'cancelled' },
    });
    await notifyDriver({
      driverId: citation.driverId,
      citationId,
      message: `Your protest for citation ${citation.citationNumber} was upheld. The citation has been cancelled.`,
      notificationType: 'follow_up',
    });
    logAdminAction(req.user.id, 'upheld_protest', 'citation', citationId, citation.citationNumber);
    return success(res, serializeCitation(updated), 'Protest upheld — citation cancelled');
  } catch (err) {
    next(err);
  }
}

/** PATCH /citations/:id/remind — admin sends a one-off payment reminder for this citation */
async function sendReminder(req, res, next) {
  try {
    const citationId = parseId(req.params.id);
    const citation =
      citationId === null ? null : await prisma.citation.findUnique({ where: { citationId } });
    if (!citation) return fail(res, 'Citation not found', 404);
    if (citation.settlementStatus !== 'pending') {
      return fail(res, 'Reminders can only be sent for unsettled citations', 409);
    }

    await notifyDriver({
      driverId: citation.driverId,
      citationId,
      message: `Your citation ${citation.citationNumber} is due for settlement. Fine: ₱${(toNumber(citation.fineAmount) || 0).toLocaleString()}`,
      notificationType: 'payment_reminder',
    });

    logAdminAction(req.user.id, 'sent_reminder', 'citation', citationId, citation.citationNumber);
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
