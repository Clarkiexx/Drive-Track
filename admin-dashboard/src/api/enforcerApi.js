import client from './client';

export function fetchEnforcers({ search = '', page = 1, limit = 10, includeArchived = false } = {}) {
  return client.get('/enforcers', { params: { search, page, limit, includeArchived } });
}

export function createEnforcer(payload) {
  return client.post('/enforcers', payload);
}

export function updateEnforcer(enforcerId, payload) {
  return client.patch(`/enforcers/${enforcerId}`, payload);
}

export function resetEnforcerPassword(enforcerId) {
  return client.patch(`/enforcers/${enforcerId}/reset-password`);
}

export function updateEnforcerStatus(enforcerId, status) {
  return client.patch(`/enforcers/${enforcerId}/status`, { status });
}

export function deleteEnforcer(enforcerId) {
  return client.delete(`/enforcers/${enforcerId}`);
}
