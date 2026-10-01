import client from './client';

export function sendBroadcast(recipientType, message, extra) {
  return client.post('/notifications/broadcast', { recipientType, message, ...(extra || {}) });
}

export function fetchBroadcasts() {
  return client.get('/notifications/broadcasts');
}
