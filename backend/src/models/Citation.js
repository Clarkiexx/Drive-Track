const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Citation = sequelize.define('Citation', {
  citationId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'citation_id',
  },
  citationNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    field: 'citation_number',
  },
  recordType: {
    type: DataTypes.ENUM('citation', 'warning', 'violation'),
    allowNull: false,
    defaultValue: 'citation',
    field: 'record_type',
  },
  driverId: { type: DataTypes.INTEGER, allowNull: false, field: 'driver_id' },
  enforcerId: { type: DataTypes.INTEGER, allowNull: false, field: 'enforcer_id' },

  // Vehicle info is a snapshot at time of issuance, not a live reference —
  // preserves history even if ownership/vehicle records change later.
  vehicleUnitType: { type: DataTypes.STRING, field: 'vehicle_unit_type' },
  plateNumber: { type: DataTypes.STRING, field: 'plate_number' },
  registeredOwner: { type: DataTypes.STRING, field: 'registered_owner' },

  otherViolation: { type: DataTypes.STRING, field: 'other_violation' },
  placeOfViolation: { type: DataTypes.STRING, allowNull: false, field: 'place_of_violation' },
  occurredAt: { type: DataTypes.DATE, allowNull: false, field: 'occurred_at' },
  latitude: { type: DataTypes.DECIMAL(10, 7), field: 'latitude' },
  longitude: { type: DataTypes.DECIMAL(10, 7), field: 'longitude' },
  driverUnderProtest: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'driver_under_protest',
  },

  // Auto-computed at creation from the sum of selected violation types'
  // default_penalty; admin may override afterward. Null for warnings.
  fineAmount: { type: DataTypes.DECIMAL(10, 2), field: 'fine_amount' },
  fineOverrideReason: { type: DataTypes.STRING, field: 'fine_override_reason' },
  dueDate: { type: DataTypes.DATEONLY, field: 'due_date' },

  verified: { type: DataTypes.BOOLEAN, defaultValue: false },
  settlementStatus: {
    type: DataTypes.ENUM('pending', 'settled', 'cancelled', 'warning_only'),
    allowNull: false,
    defaultValue: 'pending',
    field: 'settlement_status',
  },
  settledAt: { type: DataTypes.DATE, field: 'settled_at' },
  paymentMethod: {
    type: DataTypes.ENUM('cash', 'gcash', 'maya', 'bank', 'other'),
    field: 'payment_method',
  },
  paymentReference: { type: DataTypes.STRING, field: 'payment_reference' },
  receivedBy: { type: DataTypes.INTEGER, field: 'received_by' },
}, {
  tableName: 'citations',
  timestamps: true,
});

module.exports = Citation;
