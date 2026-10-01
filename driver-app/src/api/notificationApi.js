import client from './client';

export function fetchMyNotifications() {
  return client.get('/notifications/mine');
}

export function markNotificationRead(notificationId) {
  return client.patch(`/notifications/${notificationId}/read`);
}

export function markAllNotificationsRead() {
  return client.patch('/notifications/mark-all-read');
}
