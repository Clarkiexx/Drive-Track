import { NextResponse, type NextRequest } from "next/server";
import { homeForRole, isRole } from "./constants/roles";

/**
 * Route gate for the unified DriveTrack PWA (Next 16 file convention — the
 * `middleware.ts` name is deprecated; this file must export `proxy`).
 *
 * The backend has no http-only session cookie, so the client mirrors each
 * role's JWT into a same-named cookie (`auth_admin` / `auth_driver` /
 * `auth_enforcer`) purely for this check (see lib/axios.ts persistToken).
 * Cookie presence is a navigation gate only — every API call still carries
 * `Authorization: Bearer <token>` and the backend re-verifies it
 * (backend/src/middleware/auth.js). Cookie values are never validated
 * cryptographically here; a forged cookie simply fails at the API.
 *
 * Per-role cookies are what allow concurrent sessions: an admin tab writes
 * `auth_admin` while a driver tab writes `auth_driver`, and each protected
 * prefix only looks at its own cookie — sibling tabs never interfere.
 */

/** Mirror-cookie per role workspace (same values as TOKEN_STORAGE_KEYS). */
const TOKEN_COOKIES = {
  admin: "auth_admin",
  driver: "auth_driver",
  enforcer: "auth_enforcer",
} as const;

/**
 * Routes that require a session (see config.matcher below — keep the two in
 * sync: the matcher decides whether the proxy RUNS, this decides what it does).
 * Every entry also guards its nested paths (`/home`, `/home/...`).
 *
 * These three are the only role roots in this migration: the bottom nav links
 * exclusively to /admin/*, /home/* and /enforcer/*, and the old standalone
 * screens (/violations, /chat, /learning, /notifications, /profile) now live
 * nested under /home — so they need no prefix of their own. Driver auth flows
 * (/change-password, /register, /forgot-password) are driver-only screens, so
 * they share the driver cookie.
 */
const PROTECTED_PREFIXES = ["/admin", "/home", "/enforcer"] as const;

function cookieForPath(pathname: string): string | null {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return TOKEN_COOKIES.admin;
  if (pathname === "/enforcer" || pathname.startsWith("/enforcer/")) {
    return TOKEN_COOKIES.enforcer;
  }
  if (
    pathname === "/home" ||
    pathname.startsWith("/home/") ||
    pathname === "/change-password" ||
    pathname === "/register" ||
    pathname === "/forgot-password"
  ) {
    return TOKEN_COOKIES.driver;
  }
  return null;
}

/** Auth screens that bounce an already-signed-in user to their role home. */
const AUTH_PATHS = new Set(["/login", "/register"]);

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Reads the `role` claim without verifying the signature — enough to choose a
 * sensible redirect target, since the destination page re-checks auth anyway.
 */
function roleFromToken(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    ) as { role?: unknown };
    return isRole(claims.role) ? claims.role : null;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookieName = cookieForPath(pathname);
  // Role-less public pages (/login, /) carry no gate — fall through.
  // Protected prefixes consult ONLY their own role's cookie, so an admin
  // session never admits a driver tab and vice versa.
  const hasSession = cookieName ? Boolean(request.cookies.get(cookieName)?.value) : true;

  // 1. Signed-out → protected routes go to /login, remembering where they
  //    were headed so login can send them back.
  if (isProtectedPath(pathname) && !hasSession) {
    const url = new URL("/login", request.url);
    const next = `${pathname}${request.nextUrl.search}`;
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  // 2. Deliberately NO "already signed in → bounce to role home" rule.
  //
  //    There used to be one here, and it made it impossible to switch roles in a
  //    normal browser: with any session cookie present, /login 307'd away before
  //    React ran, so the login form never rendered. A signed-in driver
  //    literally could not reach the form to log in
  //    as an enforcer or an admin — the only way out was Incognito or clearing
  //    storage. (RoleGate still keeps each role out of the others' workspaces;
  //    this rule only ever governed whether the LOGIN FORM was reachable.)
  //
  //    Rendering it for a signed-in browser is safe: persisting a new session
  //    writes only that role's keys and mirror cookie (AuthContext.persistSession
  //    via lib/axios.ts persistToken), so signing in as a second role in another
  //    tab leaves this tab's session alone — and the 401 interceptor clears only
  //    the failing tab's role before navigating to /login, so this is also the
  //    page it lands on.
  //
  //    `AUTH_PATHS` and `roleFromToken` remain only as the record of that rule.

  return NextResponse.next();
}

export const config = {
  // `:path*` is zero-or-more, so "/home/:path*" matches BOTH the bare "/home"
  // and everything under it ("/home/violations") — one entry per protected
  // prefix. A plain "/home" entry would NOT match "/home/anything", letting
  // nested pages bypass the gate entirely. Keep in sync with PROTECTED_PREFIXES.
  matcher: [
    "/admin/:path*",
    "/home/:path*",
    "/enforcer/:path*",
    "/login",
    "/register",
  ],
};
