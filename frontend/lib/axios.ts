import axios, { AxiosError, type AxiosInstance } from "axios";

/**
 * Single axios instance for the whole DriveTrack PWA.
 *
 * Auth model (matches backend\src\middleware\auth.js):
 *   - The backend issues a plain JWT and expects `Authorization: Bearer <token>`.
 *   - There is NO refresh-token endpoint and NO http-only session cookie, so
 *     there is deliberately no refresh/rotation logic here — a dead token is a
 *     hard logout (see the 401 interceptor below).
 *   - The token is mirrored into the `drivetrack_token` cookie purely so
 *     `proxy.ts` can gate routes server-side; it is not sent to the backend.
 */

/** localStorage keys. Mirrored by context/AuthContext.tsx. */
export const TOKEN_STORAGE_KEY = "drivetrack_token";
export const USER_STORAGE_KEY = "drivetrack_user";

/** Cookie name read by proxy.ts (same value as TOKEN_STORAGE_KEY, different store). */
export const TOKEN_COOKIE_NAME = "drivetrack_token";

/** Envelope every backend route returns: { success, message, data, errors? }. */
export interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: unknown;
}

/** Development fallback — .env.example documents the real LAN value. */
const DEVELOPMENT_FALLBACK_API_URL = "http://localhost:5000/api/v1";

/**
 * The backend's list endpoints do NOT all agree on their payload shape:
 *   - bare arrays:  GET /citations/mine, /notifications/broadcasts, /violation-types …
 *   - wrapped:      GET /drivers  → { drivers, pagination }
 *                   GET /enforcers → { enforcers, pagination }
 *                   GET /citations → { citations, pagination }
 * Services keep a plain `T[]` return type; this picks the rows out of either
 * shape so callers never see an object where they expect a list.
 */
export function unwrapList<T>(data: unknown, rowsKey: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const rows = (data as Record<string, unknown>)[rowsKey];
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

/** Strip a trailing slash so relative paths like "/auth/driver/login" don't double up. */
export const API_BASE_URL = String(
  process.env.NEXT_PUBLIC_API_URL || DEVELOPMENT_FALLBACK_API_URL
).replace(/\/+$/, "");

const DEFAULT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

/** Reads the JWT `exp` claim (seconds) so the mirror cookie dies with the token. */
function tokenMaxAge(token: string): number {
  try {
    const payload = token.split(".")[1];
    if (!payload) return DEFAULT_COOKIE_MAX_AGE;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = Number((JSON.parse(json) as { exp?: number }).exp);
    if (Number.isFinite(exp) && exp > 0) {
      const secondsLeft = exp - Math.floor(Date.now() / 1000);
      return secondsLeft > 0 ? secondsLeft : 1;
    }
  } catch {
    // Malformed token — fall through to the default lifetime.
  }
  return DEFAULT_COOKIE_MAX_AGE;
}

/** Persists the session to localStorage AND to the proxy-only mirror cookie. */
export function persistToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  document.cookie = `${TOKEN_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${tokenMaxAge(
    token
  )}; SameSite=Lax`;
}

/** Removes token + user from every store (localStorage and cookie). */
export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  document.cookie = `${TOKEN_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** Token currently in localStorage, or null outside the browser. */
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

/** Re-writes the mirror cookie from localStorage (self-heals an expired cookie). */
export function syncAuthCookie(): void {
  const token = getStoredToken();
  if (!token) return;
  document.cookie = `${TOKEN_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${tokenMaxAge(
    token
  )}; SameSite=Lax`;
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * context/AuthContext.tsx registers its sign-out here so React state is cleared
 * when the token dies (mirrors driver-app/src/api/client.js registerUnauthorizedHandler).
 */
export function registerUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

/**
 * Login/register/forgot-password legitimately answer 401 with "bad credentials" —
 * redirecting on those would blow away the form the user is typing into.
 */
function isCredentialRequest(url = ""): boolean {
  return /\/auth\/[^?#]*(login|register|forgot-password)/.test(url);
}

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  // No default Content-Type on purpose: axios sets application/json for plain
  // objects, and a forced JSON header would make it JSON.stringify(FormData)
  // (multipart uploads — driver register, enforcer evidence photos — would be
  // corrupted). FormData gets its boundary from the browser instead.
  // No withCredentials either: the backend issues Bearer JWTs and its CORS is
  // origin-only (no Access-Control-Allow-Credentials).
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    delete config.headers.Authorization;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status;
    const requestUrl = error.config?.url ?? "";

    if (status === 401 && !isCredentialRequest(requestUrl) && typeof window !== "undefined") {
      // Stale/invalid/expired token: drop the session instead of leaving the
      // app stuck on a screen with a dead token (driver-app 401 handling).
      const alreadyOnLogin = window.location.pathname.startsWith("/login");
      clearSession();
      unauthorizedHandler?.();
      if (!alreadyOnLogin) {
        // Deliberate full page load (not router.push): every cached query and
        // in-memory client state must go with the dead token. Built as an
        // absolute URL so it is unambiguous document navigation.
        const target = new URL("/login", window.location.origin);
        target.searchParams.set("next", window.location.pathname + window.location.search);
        window.location.assign(target.toString());
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Pulls the human-readable message the backend puts in its { success, message }
 * envelope, falling back to something sane for network/500 failures.
 */
export function getApiErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (axios.isAxiosError(error)) {
    const envelope = error.response?.data as ApiEnvelope<unknown> | undefined;
    if (envelope?.message) return envelope.message;
    if (envelope?.errors && Array.isArray(envelope.errors)) {
      const first = envelope.errors[0] as { msg?: string } | undefined;
      if (first?.msg) return first.msg;
    }
    if (!error.response) return "Cannot reach the server. Check the backend address.";
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default api;
