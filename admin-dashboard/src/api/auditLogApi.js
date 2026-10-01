import client from './client';

export function fetchAuditLogs({ page = 1, limit = 25 } = {}) {
  return client.get('/audit-logs', { params: { page, limit } });
}
