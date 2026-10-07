const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const { prisma, prismaErrorToHttp } = require('../lib/prisma');
const { success, fail } = require('../utils/response');
const { getPagination } = require('../utils/pagination');
// Prisma-backed as of the lane-C port (no Sequelize left on this require path).
const { logAdminAction } = require('../services/auditLogService');

const SALT_ROUNDS = 10;

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    fail(res, 'Validation failed', 422, errors.array());
    return false;
  }
  return true;
}

/** Known Prisma errors get their mapped status/message (unique violations
 *  land on the same 409 body the old Sequelize handler produced); 500s fall
 *  through to next(err) and the generic error handler, as before. */
function respondWithMappedError(res, next, err, onConflict) {
  const http = prismaErrorToHttp(err);
  if (http.status >= 500) return next(err);
  const message = http.status === 409 && onConflict ? onConflict : http.message;
  return fail(res, message, http.status, http.errors);
}

/** GET /enforcers?search=&page=&limit= */
async function listEnforcers(req, res, next) {
  try {
    const { page, limit } = getPagination(req.query, 10);
    const { search, includeArchived, status } = req.query;

    const where = {};
    const validStatuses = ['active', 'on_leave', 'suspended', 'archived'];
    if (status && validStatuses.includes(status)) {
      where.status = status;
    } else if (includeArchived !== 'true') {
      where.status = { not: 'archived' };
    }
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { badgeNumber: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [count, rows] = await Promise.all([
      prisma.enforcer.count({ where }),
      prisma.enforcer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Bulk-count citations per enforcer in one grouped query rather than
    // one query per row. Previously hardcoded to 0 as a placeholder from
    // before the citations table existed.
    const enforcerIds = rows.map((e) => e.enforcerId);
    const citationCounts = enforcerIds.length
      ? await prisma.citation.groupBy({
          by: ['enforcerId'],
          where: { enforcerId: { in: enforcerIds } },
          _count: { _all: true },
        })
      : [];
    const countMap = Object.fromEntries(citationCounts.map((r) => [r.enforcerId, r._count._all]));

    const enforcers = rows.map((e) => {
      const { passwordHash: _omit, ...rest } = e;
      return { ...rest, citationsIssued: countMap[e.enforcerId] || 0 };
    });

    return success(res, {
      enforcers,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    });
  } catch (err) {
    return respondWithMappedError(res, next, err);
  }
}

async function getEnforcer(req, res, next) {
  try {
    const enforcerId = Number(req.params.id);
    const enforcer = Number.isInteger(enforcerId)
      ? await prisma.enforcer.findUnique({ where: { enforcerId } })
      : null;
    if (!enforcer) return fail(res, 'Enforcer not found', 404);
    const { passwordHash: _omit, ...safeEnforcer } = enforcer;
    return success(res, safeEnforcer);
  } catch (err) {
    return respondWithMappedError(res, next, err);
  }
}

/**
 * POST /enforcers — Admin's "Add Enforcer" modal (First Name, Last Name,
 * Enforcer ID Number). Username/password/badge number aren't on that form,
 * so we auto-generate a username and a temporary password, and leave
 * badgeNumber null until the admin edits the record to set it.
 */
async function createEnforcer(req, res, next) {
  try {
    if (!handleValidation(req, res)) return;

    const { firstName, lastName, employeeId, badgeNumber, station, address, contactNumber } = req.body;

    // Case-insensitive, matching the MySQL column collation this replaced.
    const existing = await prisma.enforcer.findFirst({
      where: { employeeId: { equals: employeeId, mode: 'insensitive' } },
    });
    if (existing) {
      return fail(res, 'An enforcer with this Employee ID already exists', 409);
    }

    // Auto-generate a username: first initial + last name, lowercase,
    // de-duplicated with a numeric suffix if it's already taken.
    const base = `${firstName[0]}${lastName}`.toLowerCase().replace(/[^a-z]/g, '');
    let username = base;
    let suffix = 1;
    // eslint-disable-next-line no-await-in-loop
    while (await prisma.enforcer.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    })) {
      username = `${base}${suffix}`;
      suffix += 1;
    }

    const temporaryPassword = employeeId; // simplest option: reuse their ID number as the starting password
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

    const enforcer = await prisma.enforcer.create({
      data: {
        firstName,
        lastName,
        employeeId,
        badgeNumber: badgeNumber || null,
        station: station || 'Cordova Station',
        address: address || null,
        contactNumber: contactNumber || null,
        username,
        passwordHash,
        status: 'active',
      },
    });

    const { passwordHash: _omit, ...safeEnforcer } = enforcer;
    logAdminAction(req.user.id, 'created_enforcer', 'enforcer', enforcer.enforcerId, `${firstName} ${lastName} (${employeeId})`);
    return success(
      res,
      { ...safeEnforcer, temporaryPassword },
      'Enforcer created — share the username and temporary password with them directly',
      201
    );
  } catch (err) {
    return respondWithMappedError(res, next, err);
  }
}

async function updateEnforcer(req, res, next) {
  try {
    const enforcerId = Number(req.params.id);
    const existing = Number.isInteger(enforcerId)
      ? await prisma.enforcer.findUnique({ where: { enforcerId } })
      : null;
    if (!existing) return fail(res, 'Enforcer not found', 404);

    const data = {};
    const { firstName, lastName, badgeNumber, station, address, contactNumber } = req.body;
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (badgeNumber !== undefined) data.badgeNumber = badgeNumber;
    if (station !== undefined) data.station = station;
    if (address !== undefined) data.address = address;
    if (contactNumber !== undefined) data.contactNumber = contactNumber;

    const enforcer = await prisma.enforcer.update({ where: { enforcerId }, data });

    const { passwordHash: _omit, ...safeEnforcer } = enforcer;
    logAdminAction(req.user.id, 'updated_enforcer', 'enforcer', enforcer.enforcerId, `${enforcer.firstName} ${enforcer.lastName}`);
    return success(res, safeEnforcer, 'Enforcer updated');
  } catch (err) {
    return respondWithMappedError(res, next, err);
  }
}

/** PATCH /enforcers/:id/status — active / on_leave / suspended / archived.
 *  Archived keeps the record for transparency but hides it by default. */
async function updateEnforcerStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!['active', 'on_leave', 'suspended', 'archived'].includes(status)) {
      return fail(res, 'Invalid status value', 422);
    }

    const enforcerId = Number(req.params.id);
    const existing = Number.isInteger(enforcerId)
      ? await prisma.enforcer.findUnique({ where: { enforcerId } })
      : null;
    if (!existing) return fail(res, 'Enforcer not found', 404);

    const enforcer = await prisma.enforcer.update({ where: { enforcerId }, data: { status } });

    logAdminAction(req.user.id, 'changed_enforcer_status', 'enforcer', enforcer.enforcerId, `${enforcer.firstName} ${enforcer.lastName} → ${status}`);
    return success(res, { enforcerId: enforcer.enforcerId, status }, 'Status updated');
  } catch (err) {
    return respondWithMappedError(res, next, err);
  }
}

/**
 * PATCH /enforcers/:id/reset-password — admin resets a locked-out
 * enforcer's password. Unlike the driver "forgot password" flow (which
 * the driver triggers themselves), this is admin-initiated on the
 * enforcer's behalf, since enforcer accounts are entirely admin-managed —
 * no self-service reset exists for them by design. Generates a random
 * temporary password and returns it once; there is no way to view it
 * again afterward, same as the initial account-creation flow.
 */
async function resetEnforcerPassword(req, res, next) {
  try {
    const enforcerId = Number(req.params.id);
    const existing = Number.isInteger(enforcerId)
      ? await prisma.enforcer.findUnique({ where: { enforcerId } })
      : null;
    if (!existing) return fail(res, 'Enforcer not found', 404);

    // Fixed-length CSPRNG password from an unambiguous alphabet —
    // always 10 chars (≥8 minimum), unlike base-36 slicing which can
    // come up short.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const temporaryPassword = Array.from(
      crypto.randomBytes(10),
      (byte) => alphabet[byte % alphabet.length]
    ).join('');
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);
    const enforcer = await prisma.enforcer.update({
      where: { enforcerId },
      data: { passwordHash },
    });

    logAdminAction(req.user.id, 'reset_enforcer_password', 'enforcer', enforcer.enforcerId, `${enforcer.firstName} ${enforcer.lastName}`);
    return success(
      res,
      { enforcerId: enforcer.enforcerId, username: enforcer.username, temporaryPassword },
      'Password reset — share the new temporary password with the enforcer directly'
    );
  } catch (err) {
    return respondWithMappedError(res, next, err);
  }
}

/** DELETE /enforcers/:id — permanently disabled.
 *  Historical enforcement records must be retained: use PATCH /:id/status
 *  (suspended/archived) instead of deleting an enforcer. */
async function deleteEnforcer(req, res) {
  return fail(res, 'Enforcers cannot be deleted. Historical records are retained — change the enforcer status instead.', 405);
}

module.exports = {
  listEnforcers,
  getEnforcer,
  createEnforcer,
  updateEnforcer,
  updateEnforcerStatus,
  resetEnforcerPassword,
  deleteEnforcer,
};
