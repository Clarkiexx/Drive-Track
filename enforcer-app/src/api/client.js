import axios from 'axios';
import { API_URL } from '../config';

// Backend URL comes from EXPO_PUBLIC_API_URL (see src/config.js).
// 'localhost' on a phone refers to the phone itself, so configure your
// computer's LAN IP via EXPO_PUBLIC_API_URL for on-device testing.
const BASE_URL = API_URL;

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

// AuthContext registers its signOut function here on app start. If any
// request comes back 401 (the saved token is stale/invalid — e.g. the
// database was reset, or the token expired), we clear the session and
// the navigator sends the user back to Login automatically, instead of
// leaving them stuck on a screen that can never load data.
let unauthorizedHandler = null;
export function registerUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
    }
    return Promise.reject(error);
  }
);

export default client;
