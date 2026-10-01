const { AuditLog, Admin } = require('../models');
const { success } = require('../utils/response');

/**
 * GET /audit-logs?page=&limit=
 * Read-only by design — this file intentionally has no update or delete
 * function, and no such route is ever mounted for this resource.
 */
async function listAuditLogs(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;

    const { rows, count } = await AuditLog.findAndCountAll({
      include: [{ model: Admin, attributes: ['firstName', 'lastName', 'username'] }],
      limit,
      offset: (page - 1) * limit,
      order: [['createdAt', 'DESC']],
    });

    return success(res, {
      logs: rows,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAuditLogs };
