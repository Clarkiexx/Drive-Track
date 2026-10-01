const { validationResult } = require('express-validator');
const { sequelize, Notification, Driver, Enforcer, Broadcast, Citation } = require('../models');
const { success, fail } = require('../utils/response');
const { logAdminAction } = require('../services/auditLogService');

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
    const notifications = await Notification.findAll({
      where: { driverId: req.user.id },
      order: [['createdAt', 'DESC']],
    });
    return success(res, notifications);
  } catch (err) {
    next(err);
  }
}

/** PATCH /notifications/:id/read */
async function markAsRead(req, res, next) {
  try {
    const notification = await Notification.findByPk(req.params.id);
    if (!notification) return fail(res, 'Notification not found', 404);
    if (notification.driverId !== req.user.id) {
      return fail(res, 'You are not authorized to update this notification', 403);
    }

    notification.status = 'read';
    await notification.save();

    return success(res, notification);
  } catch (err) {
    next(err);
  }
}

/** PATCH /notifications/mark-all-read */
async function markAllAsRead(req, res, next) {
  try {
    await Notification.update(
      { status: 'read' },
      { where: { driverId: req.user.id, status: 'unread' } }
    );
    return success(res, null, 'All notifications marked as read');
  } catch (err) {
    next(err);
  }
}

/** GET /notifications/enforcer/mine — enforcer's own inbox */
async function listMyEnforcerNotifications(req, res, next) {
  try {
    const notifications = await Notification.findAll({
      where: { enforcerId: req.user.id },
      order: [['createdAt', 'DESC']],
    });
    return success(res, notifications);
  } catch (err) {
    next(err);
  }
}

/** PATCH /notifications/enforcer/:id/read */
async function markEnforcerAsRead(req, res, next) {
  try {
    const notification = await Notification.findByPk(req.params.id);
    if (!notification) return fail(res, 'Notification not found', 404);
    if (notification.enforcerId !== req.user.id) {
      return fail(res, 'You are not authorized to update this notification', 403);
    }
    notification.status = 'read';
    await notification.save();
    return success(res, notification);
  } catch (err) {
    next(err);
  }
}

/** PATCH /notifications/enforcer/mark-all-read */
async function markAllEnforcerAsRead(req, res, next) {
  try {
    await Notification.update(
      { status: 'read' },
      { where: { enforcerId: req.user.id, status: 'unread' } }
    );
    return success(res, null, 'All notifications marked as read');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /notifications/broadcast — admin sends a message to drivers and/or enforcers.
 * recipientType: unsettled_drivers | all_drivers | all_enforcers | everyone | single_driver | single_enforcer
 * For single_*: pass recipientId (driverId/enforcerId) OR licenseNumber / employeeId / badgeNumber.
 */
async function sendBroadcast(req, res, next) {
  const t = await sequelize.transaction();

  try {
    if (!handleValidation(req, res)) {
      await t.rollback();
      return;
    }

    const { recipientType, message, recipientId, licenseNumber, employeeId, badgeNumber } = req.body;

    let driverRecipients = [];
    let enforcerRecipients = [];
    let resolvedRecipientId = recipientId || null;

    if (recipientType === 'unsettled_drivers') {
      // Drivers who have at least one pending citation.
      const unsettledDriverIds = await Citation.findAll({
        where: { settlementStatus: 'pending' },
        attributes: ['driverId'],
        group: ['driverId'],
        transaction: t,
      });
      const ids = unsettledDriverIds.map((c) => c.driverId);
      driverRecipients = ids.length ? await Driver.findAll({ where: { driverId: ids }, transaction: t }) : [];
    } else if (recipientType === 'all_drivers') {
      driverRecipients = await Driver.findAll({ transaction: t });
    } else if (recipientType === 'all_enforcers') {
      enforcerRecipients = await Enforcer.findAll({ where: { status: { [require('sequelize').Op.ne]: 'archived' } }, transaction: t });
    } else if (recipientType === 'everyone') {
      driverRecipients = await Driver.findAll({ transaction: t });
      enforcerRecipients = await Enforcer.findAll({ where: { status: { [require('sequelize').Op.ne]: 'archived' } }, transaction: t });
    } else if (recipientType === 'single_driver') {
      let driver = null;
      if (recipientId) driver = await Driver.findByPk(recipientId, { transaction: t });
      else if (licenseNumber) driver = await Driver.findOne({ where: { licenseNumber: String(licenseNumber).trim() }, transaction: t });
      if (!driver) {
        await t.rollback();
        return fail(res, 'Driver not found. Provide a valid driver or license number.', 404);
      }
      driverRecipients = [driver];
      resolvedRecipientId = driver.driverId;
    } else if (recipientType === 'single_enforcer') {
      let enforcer = null;
      if (recipientId) enforcer = await Enforcer.findByPk(recipientId, { transaction: t });
      else if (employeeId) enforcer = await Enforcer.findOne({ where: { employeeId: String(employeeId).trim() }, transaction: t });
      else if (badgeNumber) enforcer = await Enforcer.findOne({ where: { badgeNumber: String(badgeNumber).trim() }, transaction: t });
      if (!enforcer) {
        await t.rollback();
        return fail(res, 'Enforcer not found. Provide a valid enforcer, employee ID or badge number.', 404);
      }
      enforcerRecipients = [enforcer];
      resolvedRecipientId = enforcer.enforcerId;
    } else {
      await t.rollback();
      return fail(res, 'Invalid recipient type', 422);
    }

    const totalCount = driverRecipients.length + enforcerRecipients.length;
    const broadcast = await Broadcast.create(
      {
        adminId: req.user.id,
        recipientType,
        recipientId: resolvedRecipientId,
        message,
        recipientCount: totalCount,
      },
      { transaction: t }
    );

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
      await Notification.bulkCreate(rows, { transaction: t });
    }

    await t.commit();
    logAdminAction(req.user.id, 'sent_broadcast', 'broadcast', broadcast.broadcastId, `${recipientType} (${totalCount} recipients): ${message}`);
    return success(res, broadcast, `Broadcast sent to ${totalCount} recipient(s)`, 201);
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

/** GET /notifications/broadcasts — admin's "Recent Broadcasts" panel */
async function listBroadcasts(req, res, next) {
  try {
    const broadcasts = await Broadcast.findAll({
      order: [['createdAt', 'DESC']],
      limit: 20,
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
