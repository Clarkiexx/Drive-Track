const bcrypt = require('bcrypt');
const { Op, fn, col } = require('sequelize');
const { validationResult } = require('express-validator');
const { Driver, Citation } = require('../models');
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

/**
 * GET /drivers?search=&status=&page=&limit=
 * Admin's Driver Management list — paginated, searchable by name/license,
 * filterable by verification status.
 */
async function listDrivers(req, res, next) {
  try {
    const { page, limit } = getPagination(req.query, 8);
    const { search, status } = req.query;

    const where = {};
    if (status) where.verificationStatus = status;
    if (search) {
      where[Op.or] = [
        { firstName: { [Op.like]: `%${search}%` } },
        { lastName: { [Op.like]: `%${search}%` } },
        { licenseNumber: { [Op.like]: `%${search}%` } },
      ];
    }

    const { rows, count } = await Driver.findAndCountAll({
      where,
      limit,
      offset: (page - 1) * limit,
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['passwordHash'] },
    });

    // Bulk-count violations per driver in two grouped queries rather than
    // one query per row — avoids an N+1 query pattern across a page of
    // drivers. These were previously hardcoded to 0 as placeholders from
    // before the citations table existed; now that it does, wire them up.
    const driverIds = rows.map((d) => d.driverId);
    const [totalCounts, unsettledCounts] = driverIds.length
      ? await Promise.all([
          Citation.findAll({
            where: { driverId: driverIds },
            attributes: ['driverId', [fn('COUNT', col('citation_id')), 'count']],
            group: ['driverId'],
            raw: true,
          }),
          Citation.findAll({
            where: { driverId: driverIds, settlementStatus: 'pending' },
            attributes: ['driverId', [fn('COUNT', col('citation_id')), 'count']],
            group: ['driverId'],
            raw: true,
          }),
        ])
      : [[], []];
    const totalMap = Object.fromEntries(totalCounts.map((r) => [r.driverId, Number(r.count)]));
    const unsettledMap = Object.fromEntries(unsettledCounts.map((r) => [r.driverId, Number(r.count)]));

    const drivers = rows.map((d) => ({
      ...d.toJSON(),
      totalViolations: totalMap[d.driverId] || 0,
      unsettledViolations: unsettledMap[d.driverId] || 0,
    }));

    return success(res, {
      drivers,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    });
  } catch (err) {
    next(err);
  }
}

async function getDriver(req, res, next) {
  try {
    const driver = await Driver.findByPk(req.params.id, {
      attributes: { exclude: ['passwordHash'] },
    });
    if (!driver) return fail(res, 'Driver not found', 404);
    return success(res, driver);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /drivers  — Admin's "Add Driver" modal (First Name, Last Name, License Number).
 * Same password convention as self-registration: initial password = license
 * number, forced change on first login. Admin-created records are
 * pre-verified, same as enforcer-created ones — an admin vetting the info
 * directly is an equally trustworthy source as a physical license.
 */
async function createDriver(req, res, next) {
  try {
    if (!handleValidation(req, res)) return;

    const { firstName, lastName, licenseNumber, middleInitial, address, contactNumber,
      nationality, sex, dateOfBirth, weightKg, heightM, expirationDate, agencyCode,
      bloodType, eyeColor, dlCodes, condition } = req.body;

    const existing = await Driver.findOne({ where: { licenseNumber } });
    if (existing) {
      return fail(res, 'A driver with this license number already exists', 409);
    }

    // The username is the normalized full name and must stay unique by
    // design (no silent suffixes). A different person sharing the exact
    // same full name gets a clear error — the enforcer should verify the
    // license number spelling against the physical license instead.
    const candidateUsername = Driver.normalizeUsername(
      [firstName, middleInitial, lastName].filter(Boolean).join(' ')
    );
    const nameClash = await Driver.findOne({ where: { username: candidateUsername } });
    if (nameClash) {
      return fail(
        res,
        `A driver with the full name "${firstName} ${lastName}" already exists (license ${nameClash.licenseNumber}). ` +
          'If this is a different person, verify the name spelling against the physical license. License number remains the primary identifier.',
        409
      );
    }

    const passwordHash = await bcrypt.hash(licenseNumber, SALT_ROUNDS);

    // Admin-created records (via Driver Management) are entered deliberately
    // at a desk, so they're marked verified immediately, same as before.
    // Enforcer-created records (on-the-spot during apprehension) now start
    // as pending — the attached license photo is what the admin reviews
    // to actually confirm the record before verifying it.
    const isEnforcerCreated = req.user.role === 'enforcer';

    const driver = await Driver.create({
      firstName,
      middleInitial: middleInitial || null,
      lastName,
      licenseNumber,
      address: address || null,
      contactNumber: contactNumber || null,
      nationality: nationality || 'PHL',
      sex: sex || null,
      dateOfBirth: dateOfBirth || null,
      weightKg: weightKg || null,
      heightM: heightM || null,
      expirationDate: expirationDate || null,
      agencyCode: agencyCode || null,
      bloodType: bloodType || null,
      eyeColor: eyeColor || null,
      dlCodes: dlCodes || null,
      condition: condition || null,
      passwordHash,
      mustChangePassword: true,
      verificationStatus: isEnforcerCreated ? 'pending' : 'verified',
      licensePhotoPath: req.file ? `/uploads/licenses/${req.file.filename}` : null,
    });

    const { passwordHash: _omit, ...safeDriver } = driver.toJSON();
    if (req.user.role === 'admin') {
      logAdminAction(req.user.id, 'created_driver', 'driver', driver.driverId, `${firstName} ${lastName} (${licenseNumber})`);
    }
    return success(res, safeDriver, 'Driver created', 201);
  } catch (err) {
    // Race safety net: the pre-check above can be beaten by a concurrent
    // create — map the username unique violation to the same clear message.
    if (err.name === 'SequelizeUniqueConstraintError') {
      const usernameClash = (err.errors || []).some((e) => e.path === 'username');
      if (usernameClash) {
        return fail(
          res,
          'A driver with this full name already exists. Verify the name spelling against the physical license. License number remains the primary identifier.',
          409
        );
      }
    }
    next(err);
  }
}

async function updateDriver(req, res, next) {
  try {
    const driver = await Driver.findByPk(req.params.id);
    if (!driver) return fail(res, 'Driver not found', 404);

    const { firstName, middleInitial, lastName, address, contactNumber,
      nationality, sex, dateOfBirth, weightKg, heightM, expirationDate, agencyCode,
      bloodType, eyeColor, dlCodes, condition } = req.body;
    if (firstName !== undefined) driver.firstName = firstName;
    if (middleInitial !== undefined) driver.middleInitial = middleInitial;
    if (lastName !== undefined) driver.lastName = lastName;
    if (address !== undefined) driver.address = address;
    if (contactNumber !== undefined) driver.contactNumber = contactNumber;
    if (nationality !== undefined) driver.nationality = nationality;
    if (sex !== undefined) driver.sex = sex;
    if (dateOfBirth !== undefined) driver.dateOfBirth = dateOfBirth;
    if (weightKg !== undefined) driver.weightKg = weightKg;
    if (heightM !== undefined) driver.heightM = heightM;
    if (expirationDate !== undefined) driver.expirationDate = expirationDate;
    if (agencyCode !== undefined) driver.agencyCode = agencyCode;
    if (bloodType !== undefined) driver.bloodType = bloodType;
    if (eyeColor !== undefined) driver.eyeColor = eyeColor;
    if (dlCodes !== undefined) driver.dlCodes = dlCodes;
    if (condition !== undefined) driver.condition = condition;

    await driver.save();

    const { passwordHash: _omit, ...safeDriver } = driver.toJSON();
    logAdminAction(req.user.id, 'updated_driver', 'driver', driver.driverId, `${driver.firstName} ${driver.lastName}`);
    return success(res, safeDriver, 'Driver updated');
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return fail(
        res,
        'Another driver already uses this full name. Verify the name spelling against the physical license.',
        409
      );
    }
    next(err);
  }
}

/** PATCH /drivers/:id/status — verify / flag / revoke / reinstate a driver.
 *  No hard delete: revoked/flagged records stay for transparency. */
async function updateDriverStatus(req, res, next) {
  try {
    const { status, reason } = req.body;
    if (!['pending', 'verified', 'flagged', 'revoked', 'suspended'].includes(status)) {
      return fail(res, 'Invalid status value', 422);
    }

    const driver = await Driver.findByPk(req.params.id);
    if (!driver) return fail(res, 'Driver not found', 404);

    driver.verificationStatus = status;
    if (reason !== undefined) driver.statusReason = reason || null;
    driver.statusChangedAt = new Date();
    driver.statusChangedBy = req.user?.id || null;
    await driver.save();

    logAdminAction(req.user.id, 'changed_driver_status', 'driver', driver.driverId, `${driver.firstName} ${driver.lastName} → ${status}${reason ? ` (${reason})` : ''}`);
    return success(res, { driverId: driver.driverId, verificationStatus: status }, 'Status updated');
  } catch (err) {
    next(err);
  }
}

/** DELETE /drivers/:id — permanently disabled.
 *  Historical enforcement records must be retained: use PATCH /:id/status
 *  (revoked/suspended) instead of deleting a driver. */
async function deleteDriver(req, res) {
  return fail(res, 'Drivers cannot be deleted. Historical records are retained — change the driver status instead.', 405);
}

/**
 * GET /drivers/search?licenseNumber=&fullName=
 * Enforcer's Driver Search screen. License number is the primary lookup key
 * (exact match, since it's the internal identifier); full name is a
 * secondary fallback matched against the normalized username (the same
 * normalization login uses, so "Santos, Juan" finds "juan santos") as well
 * as first/last-name partial matches.
 */
async function searchDrivers(req, res, next) {
  try {
    const { licenseNumber, fullName } = req.query;

    // Privacy: enforcers may only look up by exact license number.
    // Admins retain name fallback for desk work.
    if (req.user?.role === 'enforcer' && !licenseNumber) {
      return fail(res, 'Search by license number only. Enter the License No. from the physical license.', 422);
    }

    if (!licenseNumber && !fullName) {
      return fail(res, 'Provide a license number or full name to search', 422);
    }

    const where = {};
    if (licenseNumber) {
      where.licenseNumber = licenseNumber.trim();
    } else if (fullName) {
      const q = fullName.trim();
      const normalized = Driver.normalizeUsername(q);
      where[Op.or] = [
        { username: { [Op.like]: `%${normalized}%` } },
        { firstName: { [Op.like]: `%${q}%` } },
        { lastName: { [Op.like]: `%${q}%` } },
        { licenseNumber: { [Op.like]: `%${q}%` } },
      ];
    }

    const drivers = await Driver.findAll({
      where,
      limit: 10,
      attributes: { exclude: ['passwordHash'] },
    });

    return success(res, drivers);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listDrivers,
  getDriver,
  createDriver,
  updateDriver,
  updateDriverStatus,
  deleteDriver,
  searchDrivers,
};
