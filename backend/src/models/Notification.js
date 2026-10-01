const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Notification = sequelize.define('Notification', {
  notificationId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'notification_id',
  },
  driverId: { type: DataTypes.INTEGER, allowNull: true, field: 'driver_id' },
  enforcerId: { type: DataTypes.INTEGER, allowNull: true, field: 'enforcer_id' },
  citationId: { type: DataTypes.INTEGER, allowNull: true, field: 'citation_id' },
  broadcastId: { type: DataTypes.INTEGER, allowNull: true, field: 'broadcast_id' },
  message: { type: DataTypes.TEXT, allowNull: false },
  notificationType: {
    type: DataTypes.ENUM(
      'citation_issued',
      'warning_issued',
      'payment_reminder',
      'settlement_confirmed',
      'follow_up',
      'announcement',
      'system_alert'
    ),
    allowNull: false,
    field: 'notification_type',
  },
  status: {
    type: DataTypes.ENUM('unread', 'read'),
    defaultValue: 'unread',
  },
}, {
  tableName: 'notifications',
  timestamps: true,
  updatedAt: false,
});

module.exports = Notification;
