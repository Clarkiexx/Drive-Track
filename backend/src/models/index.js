const sequelize = require('../config/database');
const Driver = require('./Driver');
const Enforcer = require('./Enforcer');
const Admin = require('./Admin');
const ViolationType = require('./ViolationType');
const Citation = require('./Citation');
const CitationViolation = require('./CitationViolation');
const Evidence = require('./Evidence');
const Notification = require('./Notification');
const Broadcast = require('./Broadcast');
const AuditLog = require('./AuditLog');

// --- Associations ---
Driver.hasMany(Citation, { foreignKey: 'driverId' });
Citation.belongsTo(Driver, { foreignKey: 'driverId' });

Enforcer.hasMany(Citation, { foreignKey: 'enforcerId' });
Citation.belongsTo(Enforcer, { foreignKey: 'enforcerId' });

Citation.hasMany(CitationViolation, { foreignKey: 'citationId', as: 'violations' });
CitationViolation.belongsTo(Citation, { foreignKey: 'citationId' });

ViolationType.hasMany(CitationViolation, { foreignKey: 'violationTypeId' });
CitationViolation.belongsTo(ViolationType, { foreignKey: 'violationTypeId', as: 'violationType' });

Citation.hasMany(Evidence, { foreignKey: 'citationId', as: 'evidence' });
Evidence.belongsTo(Citation, { foreignKey: 'citationId' });

Driver.hasMany(Notification, { foreignKey: 'driverId' });
Notification.belongsTo(Driver, { foreignKey: 'driverId' });

Enforcer.hasMany(Notification, { foreignKey: 'enforcerId' });
Notification.belongsTo(Enforcer, { foreignKey: 'enforcerId' });

Citation.hasMany(Notification, { foreignKey: 'citationId' });
Notification.belongsTo(Citation, { foreignKey: 'citationId' });

Broadcast.hasMany(Notification, { foreignKey: 'broadcastId' });
Notification.belongsTo(Broadcast, { foreignKey: 'broadcastId' });

Admin.hasMany(Broadcast, { foreignKey: 'adminId' });
Broadcast.belongsTo(Admin, { foreignKey: 'adminId' });

Admin.hasMany(AuditLog, { foreignKey: 'adminId' });
AuditLog.belongsTo(Admin, { foreignKey: 'adminId' });

module.exports = {
  sequelize,
  Driver,
  Enforcer,
  Admin,
  ViolationType,
  Citation,
  CitationViolation,
  Evidence,
  Notification,
  Broadcast,
  AuditLog,
};
