import client from './client';

export function fetchMyViolations() {
  return client.get('/citations/driver/mine');
}

export function fetchViolation(citationId) {
  return client.get(`/citations/${citationId}`);
}
