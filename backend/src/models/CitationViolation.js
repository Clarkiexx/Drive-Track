const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CitationViolation = sequelize.define('CitationViolation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  citationId: { type: DataTypes.INTEGER, allowNull: false, field: 'citation_id' },
  violationTypeId: { type: DataTypes.INTEGER, allowNull: false, field: 'violation_type_id' },
  // Snapshot of ViolationType.defaultPenalty at the moment this citation was
  // issued — preserves historical accuracy even if the standard penalty
  // is edited later in Violation Types Management.
  penaltyAtIssuance: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'penalty_at_issuance',
  },
}, {
  tableName: 'citation_violations',
  timestamps: false,
});

module.exports = CitationViolation;
