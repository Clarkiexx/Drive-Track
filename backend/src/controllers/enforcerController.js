const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Op, fn, col } = require('sequelize');
const { validationResult } = require('express-validator');
const { Enforcer, Citation } = require('../models');
const { success, fail } = require('../utils/response');
const { getPagination } = require('../utils/pagination');
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
      where.status = { [Op.ne]: 'archived' };
    }
    if (search) {
      where[Op.or] = [
        { firstName: { [Op.like]: `%${search}%` } },
        { lastName: { [Op.like]: `%${search}%` } },
        { badgeNumber: { [Op.like]: `%${search}%` } },
        { employeeId: { [Op.like]: `%${search}%` } },
      ];
    }

    const { rows, count } = await Enforcer.findAndCountAll({
      where,
      limit,
      offset: (page - 1) * limit,
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['passwordHash'] },
    });

    // Bulk-count citations per enforcer in one grouped query rather than
    // one query per row. Previously hardcoded to 0 as a placeholder from
    // before the citations table existed.
    const enforcerIds = rows.map((e) => e.enforcerId);
    const citationCounts = enforcerIds.length
      ? await Citation.findAll({
          where: { enforcerId: enforcerIds },
          attributes: ['enforcerId', [fn('COUNT', col('citation_id')), 'count']],
          group: ['enforcerId'],
          raw: true,
        })
      : [];
    const countMap = Object.fromEntries(citationCounts.map((r) => [r.enforcerId, Number(r.count)]));

    const enforcers = rows.map((e) => ({ ...e.toJSON(), citationsIssued: countMap[e.enforcerId] || 0 }));

    return success(res, {
      enforcers,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    });
  } catch (err) {
    next(err);
  }
}

async function getEnforcer(req, res, next) {
  try {
    const enforcer = await Enforcer.findByPk(req.params.id, {
      attributes: { exclude: ['passwordHash'] },
    });
    if (!enforcer) return fail(res, 'Enforcer not found', 404);
    return success(res, enforcer);
  } catch (err) {
    next(err);
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

    const existing = await Enforcer.findOne({ where: { employeeId } });
    if (existing) {
      return fail(res, 'An enforcer with this Employee ID already exists', 409);
    }

    // Auto-generate a username: first initial + last name, lowercase,
    // de-duplicated with a numeric suffix if it's already taken.
    const base = `${firstName[0]}${lastName}`.toLowerCase().replace(/[^a-z]/g, '');
    let username = base;
    let suffix = 1;
    // eslint-disable-next-line no-await-in-loop
    while (await Enforcer.findOne({ where: { username } })) {
      username = `${base}${suffix}`;
      suffix += 1;
    }

    const temporaryPassword = employeeId; // simplest option: reuse their ID number as the starting password
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

    const enforcer = await Enforcer.create({
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
    });

    const { passwordHash: _omit, ...safeEnforcer } = enforcer.toJSON();
    logAdminAction(req.user.id, 'created_enforcer', 'enforcer', enforcer.enforcerId, `${firstName} ${lastName} (${employeeId})`);
    return success(
      res,
      { ...safeEnforcer, temporaryPassword },
      'Enforcer created — share the username and temporary password with them directly',
      201
    );
  } catch (err) {
    next(err);
  }
}

async function updateEnforcer(req, res, next) {
  try {
    const enforcer = await Enforcer.findByPk(req.params.id);
    if (!enforcer) return fail(res, 'Enforcer not found', 404);

    const { firstName, lastName, badgeNumber, station, address, contactNumber } = req.body;
    if (firstName !== undefined) enforcer.firstName = firstName;
    if (lastName !== undefined) enforcer.lastName = lastName;
    if (badgeNumber !== undefined) enforcer.badgeNumber = badgeNumber;
    if (station !== undefined) enforcer.station = station;
    if (address !== undefined) enforcer.address = address;
    if (contactNumber !== undefined) enforcer.contactNumber = contactNumber;

    await enforcer.save();

    const { passwordHash: _omit, ...safeEnforcer } = enforcer.toJSON();
    logAdminAction(req.user.id, 'updated_enforcer', 'enforcer', enforcer.enforcerId, `${enforcer.firstName} ${enforcer.lastName}`);
    return success(res, safeEnforcer, 'Enforcer updated');
  } catch (err) {
    next(err);
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

    const enforcer = await Enforcer.findByPk(req.params.id);
    if (!enforcer) return fail(res, 'Enforcer not found', 404);

    enforcer.status = status;
    await enforcer.save();

    logAdminAction(req.user.id, 'changed_enforcer_status', 'enforcer', enforcer.enforcerId, `${enforcer.firstName} ${enforcer.lastName} → ${status}`);
    return success(res, { enforcerId: enforcer.enforcerId, status }, 'Status updated');
  } catch (err) {
    next(err);
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
    const enforcer = await Enforcer.findByPk(req.params.id);
    if (!enforcer) return fail(res, 'Enforcer not found', 404);

    // Fixed-length CSPRNG password from an unambiguous alphabet —
    // always 10 chars (≥8 minimum), unlike base-36 slicing which can
    // come up short.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const temporaryPassword = Array.from(
      crypto.randomBytes(10),
      (byte) => alphabet[byte % alphabet.length]
    ).join('');
    enforcer.passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);
    await enforcer.save();

    logAdminAction(req.user.id, 'reset_enforcer_password', 'enforcer', enforcer.enforcerId, `${enforcer.firstName} ${enforcer.lastName}`);
    return success(
      res,
      { enforcerId: enforcer.enforcerId, username: enforcer.username, temporaryPassword },
      'Password reset — share the new temporary password with the enforcer directly'
    );
  } catch (err) {
    next(err);
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
