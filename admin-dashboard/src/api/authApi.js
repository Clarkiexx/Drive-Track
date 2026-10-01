import client from './client';

export function loginAdmin({ username, password }) {
  return client.post('/auth/admin/login', { username, password });
}
