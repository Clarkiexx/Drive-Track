import client from './client';

export function loginEnforcer({ username, password }) {
  return client.post('/auth/enforcer/login', { username, password });
}
