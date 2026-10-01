import client from './client';

export function fetchActiveViolationTypes() {
  return client.get('/violation-types', { params: { active: 'true' } });
}
