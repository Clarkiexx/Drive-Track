const { Notification } = require('../models');

/**
 * Creates a single notification for a driver, optionally linked to a
 * citation. Called from citationController when a citation is issued or
 * settled, so drivers get notified automatically without the admin or
 * enforcer having to do anything extra.
 */
async function notifyDriver({ driverId, citationId = null, message, notificationType }, options = {}) {
  return Notification.create(
    { driverId, citationId, message, notificationType, status: 'unread' },
    options
  );
}

module.exports = { notifyDriver };
