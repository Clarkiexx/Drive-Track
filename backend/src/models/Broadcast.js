const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Broadcast = sequelize.define('Broadcast', {
  broadcastId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'broadcast_id',
  },
  adminId: { type: DataTypes.INTEGER, allowNull: false, field: 'admin_id' },
  recipientType: {
    type: DataTypes.ENUM('unsettled_drivers', 'all_drivers', 'all_enforcers', 'everyone', 'single_driver', 'single_enforcer'),
    allowNull: false,
    field: 'recipient_type',
  },
  recipientId: { type: DataTypes.INTEGER, allowNull: true, field: 'recipient_id' },
  message: { type: DataTypes.STRING(500), allowNull: false },
  recipientCount: { type: DataTypes.INTEGER, allowNull: false, field: 'recipient_count' },
}, {
  tableName: 'broadcasts',
  timestamps: true,
  updatedAt: false,
  // NOTE: deliberately NOT renaming createdAt here (e.g. to 'sentAt') —
  // doing that on Enforcer/Admin/Driver earlier caused a serious bug
  // (accumulating duplicate MySQL indexes across dev restarts). Standard
  // `createdAt` — auto-mapped to a `created_at` column by the global
  // underscored:true setting — serves as "sent at" here just fine.
});

module.exports = Broadcast;
