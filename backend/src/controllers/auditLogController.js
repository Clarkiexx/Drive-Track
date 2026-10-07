// Shared Prisma data layer — `src/lib/prisma.js` is the single place the
// client and the error/date/number helpers come from.
const { prisma, prismaErrorToHttp, toDateOnlyString, toNumber } = require('../lib/prisma');
const { success } = require('../utils/response');
const { getPagination } = require('../utils/pagination');

/**
 * GET /audit-logs?page=&limit=
 * Read-only by design — this file intentionally has no update or delete
 * function, and no such route is ever mounted for this resource.
 * `AuditLog.admin_id` stays NOT NULL: rows are always joined to their admin,
 * which the include below surfaces under the same `admin` key Sequelize used.
 */
async function listAuditLogs(req, res, next) {
  try {
    const { page, limit } = getPagination(req.query, 25);

    // Same rows+count pair as AuditLog.findAndCountAll, as one batched
    // transaction so the total cannot drift from the page.
    const [logs, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        include: {
          admin: { select: { firstName: true, lastName: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count(),
    ]);

    return success(res, {
      logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAuditLogs };
