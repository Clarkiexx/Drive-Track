import client from './client';

export function fetchViolationTypes() {
  return client.get('/violation-types');
}

export function createViolationType(payload) {
  return client.post('/violation-types', payload);
}

export function updateViolationType(id, payload) {
  return client.patch(`/violation-types/${id}`, payload);
}

export function updateViolationTypeStatus(id, isActive) {
  return client.patch(`/violation-types/${id}/status`, { isActive });
}
