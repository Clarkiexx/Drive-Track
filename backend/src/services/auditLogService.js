// Shared Prisma data layer — `src/lib/prisma.js` is the single place the
// client and the error/date/number helpers come from.
const { prisma, prismaErrorToHttp, toDateOnlyString, toNumber } = require('../lib/prisma');

/**
 * Records an admin action. Deliberately fire-and-forget: a logging
 * failure should never block or roll back the actual action it's
 * describing, so this catches its own errors rather than throwing.
 *
 * Write-only by design (no update/delete exists anywhere) and `adminId`
 * stays NOT NULL — there is no admin-less audit row, which is why the
 * payment webhook deliberately never calls this.
 */
async function logAdminAction(adminId, action, targetType, targetId = null, details = null) {
  try {
    await prisma.auditLog.create({
      data: { adminId, action, targetType, targetId, details },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to write audit log entry:', err.message);
  }
}

module.exports = { logAdminAction };
