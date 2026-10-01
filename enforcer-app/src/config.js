// Single place to configure the backend URL for the enforcer app.
//
// The actual LAN URL MUST come from the EXPO_PUBLIC_API_URL environment
// variable (see .env.example). Phone and computer must be on the same Wi-Fi.
//
// Why not 'localhost'? On a phone/emulator 'localhost' refers to the PHONE
// itself, not your computer, so it will NOT reach the backend. Find your
// computer's LAN IP via `ipconfig` (Windows, "IPv4 Address") or
// `ipconfig getifaddr en0` (Mac) and set:
//   EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:5000/api/v1
//
// The DEVELOPMENT_FALLBACK below exists ONLY so the app can boot without
// env configured. It is an obvious placeholder — configure
// EXPO_PUBLIC_API_URL for real LAN testing.
const DEVELOPMENT_FALLBACK = 'http://localhost:5000/api/v1';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || DEVELOPMENT_FALLBACK;

/** Base host (no /api/v1 suffix) used to resolve /uploads/* media paths. */
export function getMediaBaseUrl() {
  return String(API_URL).replace(/\/api\/v1\/?$/, '');
}

/** Resolves a backend-relative image path to an absolute URL. */
export function getMediaUrl(imagePath) {
  if (!imagePath) return '';
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  const path = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  return `${getMediaBaseUrl()}${path}`;
}
