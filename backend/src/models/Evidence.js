const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Evidence = sequelize.define('Evidence', {
  evidenceId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'evidence_id',
  },
  citationId: { type: DataTypes.INTEGER, allowNull: false, field: 'citation_id' },
  imagePath: { type: DataTypes.STRING, allowNull: false, field: 'image_path' },
  description: { type: DataTypes.STRING },
}, {
  tableName: 'evidence',
  timestamps: true,
  updatedAt: false,
});

module.exports = Evidence;
