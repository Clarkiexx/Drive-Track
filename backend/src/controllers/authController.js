const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const { prisma, prismaErrorToHttp } = require('../lib/prisma');
const { normalizeUsername, buildUsername } = require('../utils/username');
const { signToken } = require('../utils/jwt');
const { success, fail } = require('../utils/response');
const { uploadLicenseImage, toProtectedLicensePath, deleteAsset } = require('../services/cloudinaryService');

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
  let uploadedLicense = null;
  let persisted = false;
  try {
    if (!handleValidation(req, res)) return;

    const { firstName, middleInitial, lastName, licenseNumber, address, contactNumber,
      nationality, sex, dateOfBirth, weightKg, heightM, expirationDate, agencyCode,
      bloodType, eyeColor, dlCodes, condition } = req.body;
    const cleanLicense = String(licenseNumber || '').trim();

    let driver = await prisma.driver.findFirst({
      where: { licenseNumber: { equals: cleanLicense, mode: 'insensitive' } },
    });

    if (driver && driver.passwordHash) {
      return fail(res, 'An account already exists for this license number. Please log in instead.', 409);
    }

    // Upload only once the request is known to be a real registration — an
    // already-claimed license number must not leave an orphaned asset behind.
    // Neon stores the Cloudinary secure_url; clients get the admin-only proxy
    // path via toProtectedLicensePath in driverLoginPayload.
    let photoPath = null;
    if (req.file) {
      uploadedLicense = await uploadLicenseImage(req.file.buffer);
      photoPath = uploadedLicense.secure_url;
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

    persisted = true;
    return success(res, { driverId: driver.driverId, username: driver.username }, 'Registration successful', 201);
  } catch (err) {
    // The DB write may have failed after the image was stored — remove the
    // just-uploaded asset so a failed registration leaves no ghost photo.
    if (uploadedLicense && !persisted) {
      await deleteAsset(uploadedLicense.public_id, { type: 'authenticated' });
    }
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
 *
 * The name/license pair must match. A mismatch answers 404 so the form can
 * show a real fallback instead of a success message; this deliberately
 * trades a small account-enumeration signal for clear UX.
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

    if (!driver) {
      return fail(
        res,
        'No account matches that full name and license number. Please check both and try again.',
        404
      );
    }

    const passwordHash = await bcrypt.hash(driver.licenseNumber, SALT_ROUNDS);
    await prisma.driver.update({
      where: { driverId: driver.driverId },
      data: { passwordHash, mustChangePassword: true },
    });

    return success(
      res,
      null,
      'Password reset to your license number. Please log in and set a new password.'
    );
  } catch (err) {
    return respondWithMappedError(res, next, err);
  }
}

/* ------------------------------------------------------ shared login pieces */

/**
 * Success payload for a driver login. Shared by the per-role login (native
 * driver app) and the unified web login so the two can never drift apart.
 */
function driverLoginPayload(driver) {
  return {
    driverId: driver.driverId,
    firstName: driver.firstName,
    middleInitial: driver.middleInitial,
    lastName: driver.lastName,
    licenseNumber: driver.licenseNumber,
    address: driver.address,
    contactNumber: driver.contactNumber,
    verificationStatus: driver.verificationStatus,
    statusReason: driver.statusReason,
    licensePhotoPath: toProtectedLicensePath(driver.licensePhotoPath),
    profilePhotoPath: driver.profilePhotoPath,
  };
}

/** Success payload for an enforcer login (per-role + unified). */
function enforcerLoginPayload(enforcer) {
  return {
    enforcerId: enforcer.enforcerId,
    firstName: enforcer.firstName,
    lastName: enforcer.lastName,
    badgeNumber: enforcer.badgeNumber,
    station: enforcer.station,
  };
}

/** Success payload for an admin login (per-role + unified). */
function adminLoginPayload(admin) {
  return {
    adminId: admin.adminId,
    firstName: admin.firstName,
    lastName: admin.lastName,
  };
}

/**
 * Why a password-verified driver is still refused, as the exact message both
 * login paths show. null means the account is cleared to sign in.
 */
function driverBlockedMessage(driver) {
  if (driver.verificationStatus === 'revoked') {
    return 'This account has been revoked. Please contact CTMO.';
  }
  if (driver.verificationStatus === 'flagged') {
    return 'This account is currently flagged for review. Please contact CTMO.';
  }
  if (driver.verificationStatus === 'suspended') {
    return 'This account has been suspended. Please contact CTMO.';
  }
  return null;
}

/** Enforcer counterpart of driverBlockedMessage. */
function enforcerBlockedMessage(enforcer) {
  if (enforcer.status === 'suspended') return 'This account has been suspended.';
  if (enforcer.status === 'archived') {
    return 'This account has been archived. Please contact CTMO.';
  }
  return null;
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

    const blocked = driverBlockedMessage(driver);
    if (blocked) return fail(res, blocked, 403);

    const token = signToken({
      id: driver.driverId,
      role: 'driver',
      mustChangePassword: driver.mustChangePassword,
    });

    return success(res, {
      token,
      mustChangePassword: driver.mustChangePassword,
      driver: driverLoginPayload(driver),
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

/**
 * POST /auth/enforcer/change-password — the signed-in enforcer sets a new
 * password (My Profile). Mirrors driverChangePassword exactly, including
 * the fresh-token issue: the caller's JWT is replaced so no stale claims
 * linger. Same contract on purpose (newPassword only, min 8) — tightening
 * either endpoint to require the current password is a separate decision
 * that must land on both at once.
 */
async function enforcerChangePassword(req, res, next) {
  try {
    if (!handleValidation(req, res)) return;

    const { newPassword } = req.body;
    const enforcerId = Number(req.user.id);
    const enforcer = Number.isInteger(enforcerId)
      ? await prisma.enforcer.findUnique({ where: { enforcerId } })
      : null;
    if (!enforcer) return fail(res, 'Enforcer not found', 404);

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.enforcer.update({
      where: { enforcerId },
      data: { passwordHash },
    });

    const token = signToken({ id: enforcer.enforcerId, role: 'enforcer' });

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

    const blocked = enforcerBlockedMessage(enforcer);
    if (blocked) return fail(res, blocked, 403);

    const token = signToken({ id: enforcer.enforcerId, role: 'enforcer' });

    return success(res, {
      token,
      enforcer: enforcerLoginPayload(enforcer),
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
      admin: adminLoginPayload(admin),
    }, 'Login successful');
  } catch (err) {
    return respondWithMappedError(res, next, err);
  }
}

/**
 * Unified login — the single door the web PWA uses (POST /auth/login).
 *
 * The caller sends ONE identifier (a driver's full name or a staff username)
 * and a password, and does not say which kind of account they are. This
 * handler tries every table and the password decides:
 *
 *   1. driver   — identifier normalized via normalizeUsername(), the same
 *                 comparison driverLogin uses (driver usernames are stored as
 *                 normalized full names);
 *   2. enforcer — username, case-insensitive;
 *   3. admin    — username, case-insensitive.
 *
 * The first table whose record AND password match wins, so a name that
 * collides across tables still resolves to the account whose password was
 * actually given. Every rejected combination answers the same generic 401,
 * so this endpoint cannot be used to probe which table an account lives in.
 *
 * Each branch reuses the exact status gates and success payloads of the
 * per-role logins above (which the native apps and the Vite admin dashboard
 * keep calling), and the response adds an explicit `role` field so the
 * client knows which session slots the token belongs in.
 */
async function unifiedLogin(req, res, next) {
  try {
    if (!handleValidation(req, res)) return;

    const { identifier, password } = req.body;
    const cleanIdentifier = String(identifier || '').trim();

    // 1) Driver — login username is the normalized full name; the compared
    //    password is trimmed exactly as driverLogin trims it.
    const driver = await prisma.driver.findFirst({
      where: { username: normalizeUsername(cleanIdentifier) },
    });
    if (
      driver &&
      driver.passwordHash &&
      (await bcrypt.compare(String(password || '').trim(), driver.passwordHash))
    ) {
      const blocked = driverBlockedMessage(driver);
      if (blocked) return fail(res, blocked, 403);

      const token = signToken({
        id: driver.driverId,
        role: 'driver',
        mustChangePassword: driver.mustChangePassword,
      });

      return success(res, {
        token,
        role: 'driver',
        mustChangePassword: driver.mustChangePassword,
        driver: driverLoginPayload(driver),
      }, 'Login successful');
    }

    // 2) Enforcer — username, case-insensitive; password compared raw, as
    //    enforcerLogin compares it.
    const enforcer = await prisma.enforcer.findFirst({
      where: { username: { equals: cleanIdentifier, mode: 'insensitive' } },
    });
    if (
      enforcer &&
      enforcer.passwordHash &&
      (await bcrypt.compare(password, enforcer.passwordHash))
    ) {
      const blocked = enforcerBlockedMessage(enforcer);
      if (blocked) return fail(res, blocked, 403);

      const token = signToken({ id: enforcer.enforcerId, role: 'enforcer' });

      return success(res, {
        token,
        role: 'enforcer',
        enforcer: enforcerLoginPayload(enforcer),
      }, 'Login successful');
    }

    // 3) Admin — username, case-insensitive.
    const admin = await prisma.admin.findFirst({
      where: { username: { equals: cleanIdentifier, mode: 'insensitive' } },
    });
    if (admin && admin.passwordHash && (await bcrypt.compare(password, admin.passwordHash))) {
      const token = signToken({ id: admin.adminId, role: 'admin' });

      return success(res, {
        token,
        role: 'admin',
        admin: adminLoginPayload(admin),
      }, 'Login successful');
    }

    return fail(res, 'Invalid credentials', 401);
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
  enforcerChangePassword,
  adminLogin,
  unifiedLogin,
};
