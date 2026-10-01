const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Write-only by design: no update or delete route is ever exposed for
 * this table anywhere in the API, which is what makes it trustworthy as
 * an audit trail rather than an editable log an admin could quietly alter.
 */
const AuditLog = sequelize.define('AuditLog', {
  auditLogId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'audit_log_id',
  },
  adminId: { type: DataTypes.INTEGER, allowNull: false, field: 'admin_id' },
  action: { type: DataTypes.STRING, allowNull: false }, // e.g. 'verified_driver', 'reset_enforcer_password'
  targetType: { type: DataTypes.STRING, allowNull: false, field: 'target_type' }, // e.g. 'driver', 'enforcer', 'citation'
  targetId: { type: DataTypes.INTEGER, allowNull: true, field: 'target_id' },
  details: { type: DataTypes.STRING, allowNull: true },
}, {
  tableName: 'audit_logs',
  timestamps: true,
  updatedAt: false,
});

module.exports = AuditLog;
