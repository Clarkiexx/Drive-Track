const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Enforcer = sequelize.define('Enforcer', {
  enforcerId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'enforcer_id',
  },
  firstName: { type: DataTypes.STRING, allowNull: false, field: 'first_name' },
  lastName: { type: DataTypes.STRING, allowNull: false, field: 'last_name' },
  employeeId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    field: 'employee_id', // e.g. ENF-2024-001
  },
  badgeNumber: {
    type: DataTypes.STRING,
    unique: true,
    field: 'badge_number', // e.g. B-4592, set after account creation
  },
  station: { type: DataTypes.STRING, defaultValue: 'Cordova Station' },
  address: { type: DataTypes.STRING },
  contactNumber: { type: DataTypes.STRING, field: 'contact_number' },
  username: { type: DataTypes.STRING, allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: false, field: 'password_hash' },
  status: {
    type: DataTypes.ENUM('active', 'on_leave', 'suspended', 'archived'),
    defaultValue: 'active',
  },
}, {
  tableName: 'enforcers',
  timestamps: true,
});

module.exports = Enforcer;
