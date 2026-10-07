// Shared Prisma data layer — `src/lib/prisma.js` is the single place the
// client and the error/date/number helpers come from.
const { prisma, prismaErrorToHttp, toDateOnlyString, toNumber } = require('../lib/prisma');

/**
 * Creates a single notification for a driver, optionally linked to a
 * citation. Called from citationController when a citation is issued or
 * settled, so drivers get notified automatically without the admin or
 * enforcer having to do anything extra.
 *
 * `options.transaction` may carry a Prisma interactive-transaction client
 * (the payment webhook settles + notifies atomically). Anything else —
 * including a leftover Sequelize transaction from a not-yet-cut-over
 * caller — is ignored and the row is written through the shared client,
 * so this service never crashes mid-flight during the phased cutover.
 */
async function notifyDriver({ driverId, citationId = null, message, notificationType }, options = {}) {
  const tx = options.transaction;
  const db = tx && tx.notification && typeof tx.notification.create === 'function' ? tx : prisma;

  return db.notification.create({
    data: { driverId, citationId, message, notificationType, status: 'unread' },
  });
}

module.exports = { notifyDriver };
