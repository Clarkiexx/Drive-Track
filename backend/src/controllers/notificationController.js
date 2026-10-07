const { validationResult } = require('express-validator');
// Shared Prisma data layer — `src/lib/prisma.js` is the single place the
// client and the error/date/number helpers come from.
const { prisma, prismaErrorToHttp, toDateOnlyString, toNumber } = require('../lib/prisma');
const { success, fail } = require('../utils/response');
const { logAdminAction } = require('../services/auditLogService');

/**
 * `:id` params: MySQL coerced non-numeric ids (findByPk('abc') -> row id 0),
 * while Prisma rejects them with a validation error. Parse first so the
 * original "not found" 404 path is preserved. '12abc' -> 12, like MySQL.
 */
function parseId(value) {
  const id = parseInt(value, 10);
  return Number.isInteger(id) ? id : null;
}

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    fail(res, 'Validation failed', 422, errors.array());
    return false;
  }
  return true;
}

/** GET /notifications/mine — driver's own notification list */
async function listMyNotifications(req, res, next) {
  try {
    const notifications = await prisma.notification.findMany({
      where: { driverId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    return success(res, notifications);
  } catch (err) {
    next(err);
  }
}

/** PATCH /notifications/:id/read */
async function markAsRead(req, res, next) {
  try {
    const notificationId = parseId(req.params.id);
    const notification = notificationId === null
      ? null
      : await prisma.notification.findUnique({ where: { notificationId } });
    if (!notification) return fail(res, 'Notification not found', 404);
    if (notification.driverId !== req.user.id) {
      return fail(res, 'You are not authorized to update this notification', 403);
    }

    const updated = await prisma.notification.update({
      where: { notificationId },
      data: { status: 'read' },
    });

    return success(res, updated);
  } catch (err) {
    next(err);
  }
}

/** PATCH /notifications/mark-all-read */
async function markAllAsRead(req, res, next) {
  try {
    await prisma.notification.updateMany({
      where: { driverId: req.user.id, status: 'unread' },
      data: { status: 'read' },
    });
    return success(res, null, 'All notifications marked as read');
  } catch (err) {
    next(err);
  }
}

/** GET /notifications/enforcer/mine — enforcer's own inbox */
async function listMyEnforcerNotifications(req, res, next) {
  try {
    const notifications = await prisma.notification.findMany({
      where: { enforcerId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    return success(res, notifications);
  } catch (err) {
    next(err);
  }
}

/** PATCH /notifications/enforcer/:id/read */
async function markEnforcerAsRead(req, res, next) {
  try {
    const notificationId = parseId(req.params.id);
    const notification = notificationId === null
      ? null
      : await prisma.notification.findUnique({ where: { notificationId } });
    if (!notification) return fail(res, 'Notification not found', 404);
    if (notification.enforcerId !== req.user.id) {
      return fail(res, 'You are not authorized to update this notification', 403);
    }
    const updated = await prisma.notification.update({
      where: { notificationId },
      data: { status: 'read' },
    });
    return success(res, updated);
  } catch (err) {
    next(err);
  }
}

/** PATCH /notifications/enforcer/mark-all-read */
async function markAllEnforcerAsRead(req, res, next) {
  try {
    await prisma.notification.updateMany({
      where: { enforcerId: req.user.id, status: 'unread' },
      data: { status: 'read' },
    });
    return success(res, null, 'All notifications marked as read');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /notifications/broadcast — admin sends a message to drivers and/or enforcers.
 * recipientType: unsettled_drivers | all_drivers | all_enforcers | everyone | single_driver | single_enforcer
 * For single_*: pass recipientId (driverId/enforcerId) OR licenseNumber / employeeId / badgeNumber.
 *
 * The whole write runs in one `prisma.$transaction` (the Sequelize
 * transaction is gone — Prisma has no per-query `transaction:` option).
 * Early exits return an `error` marker from the callback and are answered
 * outside it, so every message string stays byte-identical.
 */
async function sendBroadcast(req, res, next) {
  try {
    // express-validator already ran as route middleware, so checking before
    // opening the transaction is equivalent to the old in-transaction check.
    if (!handleValidation(req, res)) {
      return;
    }

    const { recipientType, message, recipientId, licenseNumber, employeeId, badgeNumber } = req.body;

    const outcome = await prisma.$transaction(async (tx) => {
      let driverRecipients = [];
      let enforcerRecipients = [];
      let resolvedRecipientId = recipientId ? parseId(recipientId) : null;

      if (recipientType === 'unsettled_drivers') {
        // Drivers who have at least one pending citation.
        const pending = await tx.citation.findMany({
          where: { settlementStatus: 'pending' },
          select: { driverId: true },
        });
        const ids = [...new Set(pending.map((c) => c.driverId))];
        driverRecipients = ids.length
          ? await tx.driver.findMany({ where: { driverId: { in: ids } } })
          : [];
      } else if (recipientType === 'all_drivers') {
        driverRecipients = await tx.driver.findMany();
      } else if (recipientType === 'all_enforcers') {
        enforcerRecipients = await tx.enforcer.findMany({ where: { status: { not: 'archived' } } });
      } else if (recipientType === 'everyone') {
        driverRecipients = await tx.driver.findMany();
        enforcerRecipients = await tx.enforcer.findMany({ where: { status: { not: 'archived' } } });
      } else if (recipientType === 'single_driver') {
        let driver = null;
        if (recipientId) {
          const driverId = parseId(recipientId);
          if (driverId !== null) driver = await tx.driver.findUnique({ where: { driverId } });
        } else if (licenseNumber) {
          driver = await tx.driver.findFirst({ where: { licenseNumber: String(licenseNumber).trim() } });
        }
        if (!driver) {
          return { error: 'Driver not found. Provide a valid driver or license number.', status: 404 };
        }
        driverRecipients = [driver];
        resolvedRecipientId = driver.driverId;
      } else if (recipientType === 'single_enforcer') {
        let enforcer = null;
        if (recipientId) {
          const enforcerId = parseId(recipientId);
          if (enforcerId !== null) enforcer = await tx.enforcer.findUnique({ where: { enforcerId } });
        }
        if (!enforcer && employeeId) enforcer = await tx.enforcer.findFirst({ where: { employeeId: String(employeeId).trim() } });
        if (!enforcer && badgeNumber) enforcer = await tx.enforcer.findFirst({ where: { badgeNumber: String(badgeNumber).trim() } });
        if (!enforcer) {
          return { error: 'Enforcer not found. Provide a valid enforcer, employee ID or badge number.', status: 404 };
        }
        enforcerRecipients = [enforcer];
        resolvedRecipientId = enforcer.enforcerId;
      } else {
        return { error: 'Invalid recipient type', status: 422 };
      }

      const totalCount = driverRecipients.length + enforcerRecipients.length;
      const broadcast = await tx.broadcast.create({
        data: {
          adminId: req.user.id,
          recipientType,
          recipientId: resolvedRecipientId,
          message,
          recipientCount: totalCount,
        },
      });

      const rows = [
        ...driverRecipients.map((driver) => ({
          driverId: driver.driverId,
          broadcastId: broadcast.broadcastId,
          message,
          notificationType: 'announcement',
          status: 'unread',
        })),
        ...enforcerRecipients.map((e) => ({
          enforcerId: e.enforcerId,
          broadcastId: broadcast.broadcastId,
          message,
          notificationType: 'announcement',
          status: 'unread',
        })),
      ];
      if (rows.length > 0) {
        await tx.notification.createMany({ data: rows });
      }

      return { broadcast, totalCount };
    });

    if (outcome.error) {
      return fail(res, outcome.error, outcome.status);
    }

    logAdminAction(req.user.id, 'sent_broadcast', 'broadcast', outcome.broadcast.broadcastId, `${recipientType} (${outcome.totalCount} recipients): ${message}`);
    return success(res, outcome.broadcast, `Broadcast sent to ${outcome.totalCount} recipient(s)`, 201);
  } catch (err) {
    next(err);
  }
}

/** GET /notifications/broadcasts — admin's "Recent Broadcasts" panel */
async function listBroadcasts(req, res, next) {
  try {
    const broadcasts = await prisma.broadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return success(res, broadcasts);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listMyNotifications,
  markAsRead,
  markAllAsRead,
  listMyEnforcerNotifications,
  markEnforcerAsRead,
  markAllEnforcerAsRead,
  sendBroadcast,
  listBroadcasts,
};
