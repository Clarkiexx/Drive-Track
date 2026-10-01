// Single place to configure the backend URL for the driver app.
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

export const IS_USING_FALLBACK_API_URL = !process.env.EXPO_PUBLIC_API_URL;

const LOCALHOST_TYPOS = new Set([
  'localahost',
  'localhsot',
  'locahost',
  'loclahost',
  'lcoalhost',
  'localhot',
  'localhoust',
]);

/**
 * Fail-fast diagnosis for the #1 connectivity issue in this project: a bad
 * EXPO_PUBLIC_API_URL (typo'd host like "localahost", a "localhost" value
 * that can never work on a physical phone, or a URL missing /api/v1).
 * Returns a human-readable problem description, or null when the URL looks OK.
 */
export function describeApiUrlProblem(url = API_URL) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return `is not a valid URL ("${url}"). Expected format: http://<LAN_IP>:5000/api/v1`;
  }
  const host = String(parsed.hostname || '').toLowerCase();
  if (LOCALHOST_TYPOS.has(host)) {
    return `the hostname "${parsed.hostname}" looks like a typo of "localhost". Did you mean localhost (emulator only) or your LAN IP (physical phone)?`;
  }
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'it points at localhost, which on a physical phone means the phone itself — it can never reach your PC. Use your computer\'s LAN IP instead (e.g. http://192.168.1.19:5000/api/v1).';
  }
  if (!/\/api\/v1\/?$/.test(parsed.pathname)) {
    return `its path ("${parsed.pathname || '/'}") does not end with /api/v1. Expected format: http://<LAN_IP>:5000/api/v1`;
  }
  return null;
}

export const API_URL_PROBLEM = describeApiUrlProblem();

if (typeof __DEV__ !== 'undefined' && __DEV__ && (IS_USING_FALLBACK_API_URL || API_URL_PROBLEM)) {
  // eslint-disable-next-line no-console
  console.warn(
    `[config] EXPO_PUBLIC_API_URL is not set — using ${DEVELOPMENT_FALLBACK}. ` +
      'On a physical phone this will fail with a network error (localhost = the phone itself). ' +
      'Set EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:5000/api/v1 and restart Expo.'
  );
}

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
