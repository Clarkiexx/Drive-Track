const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const { prisma, prismaErrorToHttp, toDateOnlyString } = require('../lib/prisma');
const { normalizeUsername, buildUsername } = require('../utils/username');
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

/**
 * Response shape for a driver: passwordHash never leaves the server (the old
 * `attributes: { exclude: ['passwordHash'] }`), and the two @db.Date columns
 * are rendered as `YYYY-MM-DD` — the exact format Sequelize DATEONLY sent to
 * clients, since Prisma otherwise serializes them as full ISO timestamps.
 * Prisma Decimal columns keep serializing to strings, same as mysql2 did
 * (only the trailing-zero scale differs — see Docs/NEON_CUTOVER.md).
 */
function toDriverWire(driver) {
  const { passwordHash: _omit, ...rest } = driver;
  if (rest.dateOfBirth) rest.dateOfBirth = toDateOnlyString(rest.dateOfBirth);
  if (rest.expirationDate) rest.expirationDate = toDateOnlyString(rest.expirationDate);
  return rest;
}

/** Uniqueness violations keep the controller-specific wording; 500s fall
 *  through to next(err) and the generic error handler, as before. */
function respondWithMappedError(res, next, err, onConflict) {
  const http = prismaErrorToHttp(err);
  if (http.status >= 500) return next(err);
  const message = http.status === 409 && onConflict ? onConflict : http.message;
  return fail(res, message, http.status, http.errors);
}

/** True when a P2002 unique violation concerns the given column — the
 *  constraint target is reported as either the Prisma field name or the raw
 *  DB column, so both spellings are accepted. */
function isUniqueViolationOn(err, field) {
  if (!err || err.code !== 'P2002') return false;
  const target = err.meta && err.meta.target;
  const text = Array.isArray(target) ? target.join(',') : String(target || '');
  return text.toLowerCase().includes(field.toLowerCase());
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
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { licenseNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [count, rows] = await Promise.all([
      prisma.driver.count({ where }),
      prisma.driver.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Bulk-count violations per driver in two grouped queries rather than
    // one query per row — avoids an N+1 query pattern across a page of
    // drivers. These were previously hardcoded to 0 as placeholders from
    // before the citations table existed; now that it does, wire them up.
    const driverIds = rows.map((d) => d.driverId);
    const [totalCounts, unsettledCounts] = driverIds.length
      ? await Promise.all([
          prisma.citation.groupBy({
            by: ['driverId'],
            where: { driverId: { in: driverIds } },
            _count: { _all: true },
          }),
          prisma.citation.groupBy({
            by: ['driverId'],
            where: { driverId: { in: driverIds }, settlementStatus: 'pending' },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const totalMap = Object.fromEntries(totalCounts.map((r) => [r.driverId, r._count._all]));
    const unsettledMap = Object.fromEntries(unsettledCounts.map((r) => [r.driverId, r._count._all]));

    const drivers = rows.map((d) => ({
      ...toDriverWire(d),
      totalViolations: totalMap[d.driverId] || 0,
      unsettledViolations: unsettledMap[d.driverId] || 0,
    }));

    return success(res, {
      drivers,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    });
  } catch (err) {
    return respondWithMappedError(res, next, err);
  }
}

async function getDriver(req, res, next) {
  try {
    const driverId = Number(req.params.id);
    const driver = Number.isInteger(driverId)
      ? await prisma.driver.findUnique({ where: { driverId } })
      : null;
    if (!driver) return fail(res, 'Driver not found', 404);
    return success(res, toDriverWire(driver));
  } catch (err) {
    return respondWithMappedError(res, next, err);
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

    const existing = await prisma.driver.findFirst({
      where: { licenseNumber: { equals: licenseNumber, mode: 'insensitive' } },
    });
    if (existing) {
      return fail(res, 'A driver with this license number already exists', 409);
    }

    // The username is the normalized full name and must stay unique by
    // design (no silent suffixes). A different person sharing the exact
    // same full name gets a clear error — the enforcer should verify the
    // license number spelling against the physical license instead.
    const candidateUsername = normalizeUsername(
      [firstName, middleInitial, lastName].filter(Boolean).join(' ')
    );
    const nameClash = await prisma.driver.findFirst({
      where: { username: { equals: candidateUsername, mode: 'insensitive' } },
    });
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

    const driver = await prisma.driver.create({
      data: {
        firstName,
        middleInitial: middleInitial || null,
        lastName,
        licenseNumber,
        username: candidateUsername,
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
      },
    });

    if (req.user.role === 'admin') {
      logAdminAction(req.user.id, 'created_driver', 'driver', driver.driverId, `${firstName} ${lastName} (${licenseNumber})`);
    }
    return success(res, toDriverWire(driver), 'Driver created', 201);
  } catch (err) {
    // Race safety net: the pre-check above can be beaten by a concurrent
    // create — map the username unique violation to the same clear message.
    if (isUniqueViolationOn(err, 'username')) {
      return fail(
        res,
        'A driver with this full name already exists. Verify the name spelling against the physical license. License number remains the primary identifier.',
        409
      );
    }
    return respondWithMappedError(res, next, err);
  }
}

async function updateDriver(req, res, next) {
  try {
    const driverId = Number(req.params.id);
    const driver = Number.isInteger(driverId)
      ? await prisma.driver.findUnique({ where: { driverId } })
      : null;
    if (!driver) return fail(res, 'Driver not found', 404);

    const { firstName, middleInitial, lastName, address, contactNumber,
      nationality, sex, dateOfBirth, weightKg, heightM, expirationDate, agencyCode,
      bloodType, eyeColor, dlCodes, condition } = req.body;

    const data = {};
    if (firstName !== undefined) data.firstName = firstName;
    if (middleInitial !== undefined) data.middleInitial = middleInitial;
    if (lastName !== undefined) data.lastName = lastName;
    if (address !== undefined) data.address = address;
    if (contactNumber !== undefined) data.contactNumber = contactNumber;
    if (nationality !== undefined) data.nationality = nationality;
    if (sex !== undefined) data.sex = sex;
    if (dateOfBirth !== undefined) data.dateOfBirth = dateOfBirth;
    if (weightKg !== undefined) data.weightKg = weightKg;
    if (heightM !== undefined) data.heightM = heightM;
    if (expirationDate !== undefined) data.expirationDate = expirationDate;
    if (agencyCode !== undefined) data.agencyCode = agencyCode;
    if (bloodType !== undefined) data.bloodType = bloodType;
    if (eyeColor !== undefined) data.eyeColor = eyeColor;
    if (dlCodes !== undefined) data.dlCodes = dlCodes;
    if (condition !== undefined) data.condition = condition;

    // The login username tracks the name columns — the old beforeValidate
    // hook recomputed it on every save, so do the same from the merged
    // (post-patch) values.
    data.username = buildUsername(
      data.firstName !== undefined ? data.firstName : driver.firstName,
      data.middleInitial !== undefined ? data.middleInitial : driver.middleInitial,
      data.lastName !== undefined ? data.lastName : driver.lastName
    );

    const updated = await prisma.driver.update({ where: { driverId }, data });

    logAdminAction(req.user.id, 'updated_driver', 'driver', updated.driverId, `${updated.firstName} ${updated.lastName}`);
    return success(res, toDriverWire(updated), 'Driver updated');
  } catch (err) {
    if (isUniqueViolationOn(err, 'username')) {
      return fail(
        res,
        'Another driver already uses this full name. Verify the name spelling against the physical license.',
        409
      );
    }
    return respondWithMappedError(res, next, err);
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

    const driverId = Number(req.params.id);
    const driver = Number.isInteger(driverId)
      ? await prisma.driver.findUnique({ where: { driverId } })
      : null;
    if (!driver) return fail(res, 'Driver not found', 404);

    const updated = await prisma.driver.update({
      where: { driverId },
      data: {
        verificationStatus: status,
        statusReason: reason !== undefined ? (reason || null) : driver.statusReason,
        statusChangedAt: new Date(),
        statusChangedBy: req.user?.id || null,
      },
    });

    logAdminAction(req.user.id, 'changed_driver_status', 'driver', updated.driverId, `${updated.firstName} ${updated.lastName} → ${status}${reason ? ` (${reason})` : ''}`);
    return success(res, { driverId: updated.driverId, verificationStatus: status }, 'Status updated');
  } catch (err) {
    return respondWithMappedError(res, next, err);
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
      where.licenseNumber = { equals: licenseNumber.trim(), mode: 'insensitive' };
    } else if (fullName) {
      const q = fullName.trim();
      const normalized = normalizeUsername(q);
      where.OR = [
        { username: { contains: normalized, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { licenseNumber: { contains: q, mode: 'insensitive' } },
      ];
    }

    const drivers = await prisma.driver.findMany({ where, take: 10 });

    return success(res, drivers.map(toDriverWire));
  } catch (err) {
    return respondWithMappedError(res, next, err);
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
