import client from './client';

export function fetchDrivers({ search = '', status = '', page = 1, limit = 8 } = {}) {
  return client.get('/drivers', { params: { search, status, page, limit } });
}

export function createDriver(payload) {
  return client.post('/drivers', payload);
}

export function updateDriver(driverId, payload) {
  return client.patch(`/drivers/${driverId}`, payload);
}

export function updateDriverStatus(driverId, status, reason) {
  return client.patch(`/drivers/${driverId}/status`, reason ? { status, reason } : { status });
}

export function deleteDriver(driverId) {
  return client.delete(`/drivers/${driverId}`);
}

export function fetchDriverCitations(driverId) {
  return client.get(`/drivers/${driverId}/citations`);
}
