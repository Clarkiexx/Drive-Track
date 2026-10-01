import client from './client';

export function fetchMyNotifications() {
  return client.get('/notifications/enforcer/mine');
}

export function markNotificationRead(notificationId) {
  return client.patch(`/notifications/enforcer/${notificationId}/read`);
}

export function markAllNotificationsRead() {
  return client.patch('/notifications/enforcer/mark-all-read');
}
