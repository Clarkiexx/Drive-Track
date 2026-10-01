const { AuditLog } = require('../models');

/**
 * Records an admin action. Deliberately fire-and-forget: a logging
 * failure should never block or roll back the actual action it's
 * describing, so this catches its own errors rather than throwing.
 */
async function logAdminAction(adminId, action, targetType, targetId = null, details = null) {
  try {
    await AuditLog.create({ adminId, action, targetType, targetId, details });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to write audit log entry:', err.message);
  }
}

module.exports = { logAdminAction };
