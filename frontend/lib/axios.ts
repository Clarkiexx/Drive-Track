import axios, { AxiosError, type AxiosInstance } from "axios";
import { isRole, type Role } from "@/constants/roles";

/**
 * Single axios instance for the whole DriveTrack PWA.
 *
 * Auth model (matches backend\src\middleware\auth.js):
 *   - The backend issues a plain JWT and expects `Authorization: Bearer <token>`.
 *   - There is NO refresh-token endpoint and NO http-only session cookie, so
 *     there is deliberately no refresh/rotation logic here — a dead token is a
 *     hard logout (see the 401 interceptor below).
 *   - Each role's token is mirrored into a same-named cookie purely so
 *     `proxy.ts` can gate routes server-side; cookies are never sent to the
 *     backend.
 *
 * Concurrent sessions: one Chrome browser can hold an admin, a driver AND an
 * enforcer session at the same time (one tab per role). Every store is
 * namespaced per role — a tab only ever reads/writes/clears its own role's
 * keys, so logging in/out (or a 401) in one tab never disturbs the others.
 */

/**
 * Per-role localStorage keys (token + profile blob) and mirror-cookie names.
 * The cookie and the token key share a name on purpose — they are different
 * stores (cookie jar vs localStorage), and one constant covers both.
 */
export const TOKEN_STORAGE_KEYS: Record<Role, string> = {
  admin: "auth_admin",
  driver: "auth_driver",
  enforcer: "auth_enforcer",
};

export const USER_STORAGE_KEYS: Record<Role, string> = {
  admin: "auth_admin_user",
  driver: "auth_driver_user",
  enforcer: "auth_enforcer_user",
};

/**
 * Legacy single-session keys, superseded by the per-role maps above. Kept
 * only as documentation: entries left behind under these names are orphaned
 * (each role re-logs in once) and are never read. Do NOT add new reads of
 * these — that would reintroduce the cross-tab conflict.
 * @deprecated
 */
export const TOKEN_STORAGE_KEY = "drivetrack_token";
/** @deprecated See TOKEN_STORAGE_KEY. */
export const USER_STORAGE_KEY = "drivetrack_user";

/** Cookie names read by proxy.ts (same values as TOKEN_STORAGE_KEYS). */
export const TOKEN_COOKIE_NAMES: Record<Role, string> = { ...TOKEN_STORAGE_KEYS };
/** @deprecated See TOKEN_STORAGE_KEY. */
export const TOKEN_COOKIE_NAME = "drivetrack_token";

/** Marker remembering which role logged in most recently (landing-page hint). */
const LAST_ROLE_KEY = "auth_last_role";

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

/**
 * Which role owns a page path. Driver auth flows without a role prefix
 * (/change-password, /register, /forgot-password) belong to the driver —
 * only drivers ever open them. /login and / have no owner (see
 * resolveBootRole); anything unrecognised returns null (no token attached).
 */
export function roleForPathname(pathname: string | null | undefined): Role | null {
  if (!pathname) return null;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname === "/enforcer" || pathname.startsWith("/enforcer/")) return "enforcer";
  if (
    pathname === "/home" ||
    pathname.startsWith("/home/") ||
    pathname === "/change-password" ||
    pathname === "/register" ||
    pathname === "/forgot-password"
  ) {
    return "driver";
  }
  return null;
}

/**
 * Which role owns an API request. Role-scoped auth endpoints
 * (/auth/driver/…, /auth/enforcer/…, /auth/admin/…) name their role, so the
 * correct key is used even from role-less pages like /login. Returns null for
 * shared endpoints — callers then fall back to the page's role.
 */
export function roleForRequestUrl(url = ""): Role | null {
  const match = /\/auth\/(driver|enforcer|admin)(?:\/|[?#]|$)/.exec(url);
  return match && isRole(match[1]) ? match[1] : null;
}

/** Current tab's role from its location (null outside the browser). */
function currentPathRole(): Role | null {
  if (typeof window === "undefined") return null;
  return roleForPathname(window.location.pathname);
}

/**
 * Boot-time role resolution for role-less pages (/ and /login): the most
 * recently used role with a stored token wins, else the first stored token in
 * driver → enforcer → admin order. Only ever used to decide which session to
 * restore locally — it never sends another role's token anywhere.
 */
export function resolveBootRole(): Role | null {
  if (typeof window === "undefined") return null;
  const last = window.localStorage.getItem(LAST_ROLE_KEY);
  if (isRole(last) && window.localStorage.getItem(TOKEN_STORAGE_KEYS[last])) return last;
  for (const role of ["driver", "enforcer", "admin"] as const) {
    if (window.localStorage.getItem(TOKEN_STORAGE_KEYS[role])) return role;
  }
  return null;
}

/** Role for this tab: its path prefix, or the boot resolution on bare pages. */
export function currentRole(): Role | null {
  return currentPathRole() ?? resolveBootRole();
}

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

/**
 * Persists one role's session to its localStorage slots AND to its
 * proxy-only mirror cookie. Other roles' keys are never touched, so a login
 * in this tab cannot disturb sibling tabs.
 */
export function persistToken(token: string, role: Role): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_STORAGE_KEYS[role], token);
  window.localStorage.setItem(LAST_ROLE_KEY, role);
  document.cookie = `${TOKEN_COOKIE_NAMES[role]}=${encodeURIComponent(token)}; Path=/; Max-Age=${tokenMaxAge(
    token
  )}; SameSite=Lax`;
}

/**
 * Removes one role's token + user blob + mirror cookie. Pass null to clear
 * nothing (callers resolve the role first; unknown role clears nothing rather
 * than risking another role's session).
 */
export function clearSession(role: Role | null): void {
  if (typeof window === "undefined" || !role) return;
  window.localStorage.removeItem(TOKEN_STORAGE_KEYS[role]);
  window.localStorage.removeItem(USER_STORAGE_KEYS[role]);
  document.cookie = `${TOKEN_COOKIE_NAMES[role]}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Token for the given role (defaults to this tab's role). A tab only ever
 * asks for its own role — cross-role reads would let tabs impersonate each
 * other, so there is deliberately no "give me every token" helper.
 */
export function getStoredToken(role: Role | null = currentRole()): string | null {
  if (typeof window === "undefined" || !role) return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEYS[role]);
}

/** Stored profile blob for the given role (null when absent/unparseable). */
export function getStoredUser<T>(role: Role | null): T | null {
  if (typeof window === "undefined" || !role) return null;
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEYS[role]);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    window.localStorage.removeItem(USER_STORAGE_KEYS[role]);
    return null;
  }
}

/** Persists the profile blob alongside its role's token. */
export function persistUser(role: Role, user: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_STORAGE_KEYS[role], JSON.stringify(user));
}

/** Re-writes this tab's mirror cookie from its own key (self-heal). */
export function syncAuthCookie(role: Role | null = currentRole()): void {
  const token = role ? getStoredToken(role) : null;
  if (!token || !role) return;
  document.cookie = `${TOKEN_COOKIE_NAMES[role]}=${encodeURIComponent(token)}; Path=/; Max-Age=${tokenMaxAge(
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
  // Role-scoped auth endpoints name their role (/auth/driver/…); everything
  // else belongs to this tab's route prefix. Either way the attached token
  // can only ever be this tab's own role — cross-role requests keep failing
  // at the backend exactly as before.
  const role = roleForRequestUrl(config.url) ?? currentRole();
  const token = role ? getStoredToken(role) : null;
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
      // Stale/invalid/expired token: drop ONLY this tab's role session.
      // Sibling tabs keep their own keys, cookies and in-memory state, so a
      // dead admin token never signs the driver's tab out (and vice versa).
      const role = roleForRequestUrl(requestUrl) ?? currentPathRole();
      const alreadyOnLogin = window.location.pathname.startsWith("/login");
      clearSession(role);
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
 *
 * When the envelope message is the generic "Validation failed" (express
 * validators, Prisma value mapping), the per-field `errors` entries say
 * more — join up to three, tolerating string, { msg } and { message }
 * shapes (P2002 uses strings, express-validator uses { msg }).
 */
export function getApiErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (axios.isAxiosError(error)) {
    const envelope = error.response?.data as ApiEnvelope<unknown> | undefined;
    if (envelope?.message && envelope.message !== "Validation failed") return envelope.message;
    if (envelope?.errors && Array.isArray(envelope.errors)) {
      const details = (envelope.errors as unknown[])
        .map((entry) => {
          if (typeof entry === "string") return entry;
          if (entry && typeof entry === "object") {
            const record = entry as { msg?: unknown; message?: unknown };
            if (typeof record.msg === "string") return record.msg;
            if (typeof record.message === "string") return record.message;
          }
          return "";
        })
        .filter(Boolean)
        .slice(0, 3);
      if (details.length > 0) return details.join("; ");
    }
    if (envelope?.message) return envelope.message;
    if (!error.response) return "Cannot reach the server. Check the backend address.";
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default api;
