const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const { prisma, prismaErrorToHttp } = require('../lib/prisma');
const { normalizeUsername, buildUsername } = require('../utils/username');
const { signToken } = require('../utils/jwt');
const { success, fail } = require('../utils/response');

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
 * Maps a Prisma error onto the shared HTTP contract. Controllers that own a
 * more specific message override it; 500s fall through to next(err) and the
 * generic error handler, exactly as before.
 */
function respondWithMappedError(res, next, err, onConflict) {
  const http = prismaErrorToHttp(err);
  if (http.status >= 500) return next(err);
  const message = http.status === 409 && onConflict ? onConflict : http.message;
  return fail(res, message, http.status, http.errors);
}

/**
 * Driver self-registration.
 * If a driver record already exists for this license number with no
 * password set (created earlier by an enforcer during apprehension),
 * this "claims" that record instead of creating a duplicate.
 * If a record exists AND already has credentials, registration is rejected.
 */
async function driverRegister(req, res, next) {
  try {
    if (!handleValidation(req, res)) return;

    const { firstName, middleInitial, lastName, licenseNumber, address, contactNumber,
      nationality, sex, dateOfBirth, weightKg, heightM, expirationDate, agencyCode,
      bloodType, eyeColor, dlCodes, condition } = req.body;
    const cleanLicense = String(licenseNumber || '').trim();
    const photoPath = req.file ? `/uploads/licenses/${req.file.filename}` : null;

    let driver = await prisma.driver.findFirst({
      where: { licenseNumber: { equals: cleanLicense, mode: 'insensitive' } },
    });

    if (driver && driver.passwordHash) {
      return fail(res, 'An account already exists for this license number. Please log in instead.', 409);
    }

    const passwordHash = await bcrypt.hash(cleanLicense, SALT_ROUNDS);
    // The normalized full name is stored as the login username — the old
    // Sequelize beforeValidate hook computed it on every save.
    const username = buildUsername(firstName, middleInitial, lastName);

    if (driver) {
      // Claim the existing enforcer-created record.
      const data = {
        firstName,
        middleInitial: middleInitial || null,
        lastName,
        username,
        passwordHash,
        mustChangePassword: true,
        // verificationStatus is left as-is: it was already 'verified' because
        // the record originated from an enforcer reading the physical license.
      };
      if (address) data.address = address;
      if (contactNumber) data.contactNumber = contactNumber;
      if (nationality) data.nationality = nationality;
      if (sex) data.sex = sex;
      if (dateOfBirth) data.dateOfBirth = dateOfBirth;
      if (weightKg) data.weightKg = weightKg;
      if (heightM) data.heightM = heightM;
      if (expirationDate) data.expirationDate = expirationDate;
      if (agencyCode) data.agencyCode = agencyCode;
      if (bloodType) data.bloodType = bloodType;
      if (eyeColor) data.eyeColor = eyeColor;
      if (dlCodes) data.dlCodes = dlCodes;
      if (condition) data.condition = condition;
      if (photoPath) data.licensePhotoPath = photoPath;

      driver = await prisma.driver.update({ where: { driverId: driver.driverId }, data });
    } else {
      driver = await prisma.driver.create({
        data: {
          firstName,
          middleInitial: middleInitial || null,
          lastName,
          licenseNumber: cleanLicense,
          username,
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
          licensePhotoPath: photoPath,
          passwordHash,
          mustChangePassword: true,
          verificationStatus: 'pending', // self-asserted, no enforcer confirmation yet
        },
      });
    }

    return success(res, { driverId: driver.driverId, username: driver.username }, 'Registration successful', 201);
  } catch (err) {
    // Unique violation (username or license number) keeps the old wording:
    // the license-number case was pre-checked above, so this is the
    // "same full name" path (or a concurrent race onto it).
    return respondWithMappedError(
      res, next, err,
      'A driver with this full name already exists. Please verify your name spelling, or contact CTMO with your license number.'
    );
  }
}

/**
 * Driver "Forgot Password": verifies identity the same way login credentials
 * were originally established (full name + license number, both printed on
 * the physical license), then resets the password back to the license
 * number and forces a change on next login — reusing the exact same
 * trusted mechanism as onboarding rather than building a separate
 * email/SMS reset pipeline, which is out of scope for this capstone.
 * Always returns a generic success message regardless of match, so this
 * endpoint can't be used to check which license numbers are registered.
 */
async function driverForgotPassword(req, res, next) {
  try {
    if (!handleValidation(req, res)) return;

    const { fullName, licenseNumber } = req.body;
    const normalized = normalizeUsername(fullName);

    const driver = await prisma.driver.findFirst({
      where: {
        username: normalized,
        licenseNumber: { equals: String(licenseNumber || '').trim(), mode: 'insensitive' },
      },
    });

    if (driver) {
      const passwordHash = await bcrypt.hash(driver.licenseNumber, SALT_ROUNDS);
      await prisma.driver.update({
        where: { driverId: driver.driverId },
        data: { passwordHash, mustChangePassword: true },
      });
    }

    return success(
      res,
      null,
      'If those details match an account, the password has been reset to the license number. Please log in and set a new password.'
    );
  } catch (err) {
    return respondWithMappedError(res, next, err);
  }
}

/**
 * Driver login: username = full name (case/format-insensitive), password = license number
 * (or the driver's own password after they've changed it).
 */
async function driverLogin(req, res, next) {
  try {
    if (!handleValidation(req, res)) return;

    const { fullName, password } = req.body;
    const normalized = normalizeUsername(fullName);
    const cleanPassword = String(password || '').trim();

    const driver = await prisma.driver.findFirst({ where: { username: normalized } });
    if (!driver || !driver.passwordHash) {
      return fail(res, 'Invalid credentials', 401);
    }

    const match = await bcrypt.compare(cleanPassword, driver.passwordHash);
    if (!match) {
      return fail(res, 'Invalid credentials', 401);
    }

    if (driver.verificationStatus === 'revoked') {
      return fail(res, 'This account has been revoked. Please contact CTMO.', 403);
    }
    if (driver.verificationStatus === 'flagged') {
      return fail(res, 'This account is currently flagged for review. Please contact CTMO.', 403);
    }
    if (driver.verificationStatus === 'suspended') {
      return fail(res, 'This account has been suspended. Please contact CTMO.', 403);
    }

    const token = signToken({
      id: driver.driverId,
      role: 'driver',
      mustChangePassword: driver.mustChangePassword,
    });

    return success(res, {
      token,
      mustChangePassword: driver.mustChangePassword,
      driver: {
        driverId: driver.driverId,
        firstName: driver.firstName,
        middleInitial: driver.middleInitial,
        lastName: driver.lastName,
        licenseNumber: driver.licenseNumber,
        address: driver.address,
        contactNumber: driver.contactNumber,
        verificationStatus: driver.verificationStatus,
        statusReason: driver.statusReason,
        licensePhotoPath: driver.licensePhotoPath,
      },
    }, 'Login successful');
  } catch (err) {
    return respondWithMappedError(res, next, err);
  }
}

async function driverChangePassword(req, res, next) {
  try {
    if (!handleValidation(req, res)) return;

    const { newPassword } = req.body;
    const driverId = Number(req.user.id);
    const driver = Number.isInteger(driverId)
      ? await prisma.driver.findUnique({ where: { driverId } })
      : null;
    if (!driver) return fail(res, 'Driver not found', 404);

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.driver.update({
      where: { driverId: driver.driverId },
      data: { passwordHash, mustChangePassword: false },
    });

    // Issue a fresh token: the caller's JWT still carries
    // mustChangePassword=true and would otherwise stay blocked.
    const token = signToken({
      id: driver.driverId,
      role: 'driver',
      mustChangePassword: false,
    });

    return success(res, { token }, 'Password updated successfully');
  } catch (err) {
    return respondWithMappedError(res, next, err);
  }
}

async function enforcerLogin(req, res, next) {
  try {
    if (!handleValidation(req, res)) return;

    const { username, password } = req.body;
    const enforcer = await prisma.enforcer.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });
    if (!enforcer) return fail(res, 'Invalid credentials', 401);

    const match = await bcrypt.compare(password, enforcer.passwordHash);
    if (!match) return fail(res, 'Invalid credentials', 401);

    if (enforcer.status === 'suspended') {
      return fail(res, 'This account has been suspended.', 403);
    }
    if (enforcer.status === 'archived') {
      return fail(res, 'This account has been archived. Please contact CTMO.', 403);
    }

    const token = signToken({ id: enforcer.enforcerId, role: 'enforcer' });

    return success(res, {
      token,
      enforcer: {
        enforcerId: enforcer.enforcerId,
        firstName: enforcer.firstName,
        lastName: enforcer.lastName,
        badgeNumber: enforcer.badgeNumber,
        station: enforcer.station,
      },
    }, 'Login successful');
  } catch (err) {
    return respondWithMappedError(res, next, err);
  }
}

async function adminLogin(req, res, next) {
  try {
    if (!handleValidation(req, res)) return;

    const { username, password } = req.body;
    const admin = await prisma.admin.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });
    if (!admin) return fail(res, 'Invalid credentials', 401);

    const match = await bcrypt.compare(password, admin.passwordHash);
    if (!match) return fail(res, 'Invalid credentials', 401);

    const token = signToken({ id: admin.adminId, role: 'admin' });

    return success(res, {
      token,
      admin: {
        adminId: admin.adminId,
        firstName: admin.firstName,
        lastName: admin.lastName,
      },
    }, 'Login successful');
  } catch (err) {
    return respondWithMappedError(res, next, err);
  }
}

module.exports = {
  driverRegister,
  driverForgotPassword,
  driverLogin,
  driverChangePassword,
  enforcerLogin,
  adminLogin,
};
