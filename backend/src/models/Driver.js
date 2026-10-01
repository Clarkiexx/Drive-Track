const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Driver = sequelize.define('Driver', {
  driverId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'driver_id',
  },
  firstName: { type: DataTypes.STRING, allowNull: false, field: 'first_name' },
  middleInitial: { type: DataTypes.STRING(5), field: 'middle_initial' },
  lastName: { type: DataTypes.STRING, allowNull: false, field: 'last_name' },
  address: { type: DataTypes.STRING },
  contactNumber: { type: DataTypes.STRING, field: 'contact_number' },
  licenseNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    field: 'license_number',
  },
  // Normalized (lowercase, single-spaced, no punctuation) "First MI Last" string.
  // Kept in sync automatically below — never set this directly.
  username: { type: DataTypes.STRING, unique: true },
  passwordHash: { type: DataTypes.STRING, field: 'password_hash' },
  mustChangePassword: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'must_change_password',
  },
  verificationStatus: {
    type: DataTypes.ENUM('pending', 'verified', 'flagged', 'revoked', 'suspended'),
    defaultValue: 'pending',
    field: 'verification_status',
  },
  statusReason: { type: DataTypes.TEXT, field: 'status_reason' },
  statusChangedAt: { type: DataTypes.DATE, field: 'status_changed_at' },
  statusChangedBy: { type: DataTypes.INTEGER, field: 'status_changed_by' },
  // Full license details (shown in admin Driver Record modal)
  nationality: { type: DataTypes.STRING(10), defaultValue: 'PHL' },
  sex: { type: DataTypes.STRING(10) },
  dateOfBirth: { type: DataTypes.DATEONLY, field: 'date_of_birth' },
  weightKg: { type: DataTypes.DECIMAL(5, 2), field: 'weight_kg' },
  heightM: { type: DataTypes.DECIMAL(4, 2), field: 'height_m' },
  expirationDate: { type: DataTypes.DATEONLY, field: 'expiration_date' },
  agencyCode: { type: DataTypes.STRING, field: 'agency_code' },
  bloodType: { type: DataTypes.STRING(10), field: 'blood_type' },
  eyeColor: { type: DataTypes.STRING(30), field: 'eye_color' },
  dlCodes: { type: DataTypes.STRING, field: 'dl_codes' },
  condition: { type: DataTypes.STRING },
  // Photo of the physical license, captured by the enforcer at the moment
  // of on-the-spot driver creation — gives the admin something concrete
  // to verify against rather than just trusting the enforcer's word.
  // Null for self-registered or admin-created records.
  licensePhotoPath: { type: DataTypes.STRING, field: 'license_photo_path' },
}, {
  tableName: 'drivers',
  timestamps: true,
  hooks: {
    beforeValidate: (driver) => {
      // Must match Driver.normalizeUsername() exactly, otherwise a driver
      // can register successfully but never log in (e.g. double spaces or
      // "Dela  Cruz" inside a single field would previously mismatch).
      const parts = [driver.firstName, driver.middleInitial, driver.lastName]
        .filter(Boolean)
        .map((p) => String(p).replace(/[.,]/g, '').trim())
        .filter(Boolean);
      driver.username = parts.join(' ').replace(/\s+/g, ' ').toLowerCase();
    },
  },
});

/** Normalizes any user-typed full name the same way, for login comparison. */
Driver.normalizeUsername = (rawFullName) =>
  String(rawFullName || '').replace(/[.,]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

module.exports = Driver;

