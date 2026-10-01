import axios from 'axios';

// Browser-based app, so 'localhost' works when the backend runs on the
// same machine. Configured via VITE_API_URL so LAN/staging hosts don't
// require source edits (see admin-dashboard/.env.example).
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

/** Base host (no /api/v1 suffix) used to resolve /uploads/* media paths. */
export function getMediaBaseUrl() {
  return String(BASE_URL).replace(/\/api\/v1\/?$/, '');
}

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

export function setAuthToken(token) {
  if (token) {
    client.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete client.defaults.headers.common.Authorization;
  }
}

// If any request comes back 401 (expired/invalid token), the stored
// session is no longer valid — clear it and send the admin back to
// Login instead of leaving them stuck looking at a raw error message.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('drivetrack_admin_token');
      localStorage.removeItem('drivetrack_admin_info');
      setAuthToken(null);
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default client;
