const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ViolationType = sequelize.define('ViolationType', {
  violationTypeId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'violation_type_id',
  },
  articleSection: { type: DataTypes.STRING, allowNull: false, field: 'article_section' },
  description: { type: DataTypes.STRING, allowNull: false },
  category: {
    type: DataTypes.ENUM('moving', 'non_moving'),
    allowNull: false,
  },
  defaultPenalty: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'default_penalty',
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active',
  },
}, {
  tableName: 'violation_types',
  timestamps: true,
});

module.exports = ViolationType;
