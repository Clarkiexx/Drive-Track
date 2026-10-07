import { NextResponse, type NextRequest } from "next/server";
import { homeForRole, isRole } from "./constants/roles";

/**
 * Route gate for the unified DriveTrack PWA (Next 16 file convention — the
 * `middleware.ts` name is deprecated; this file must export `proxy`).
 *
 * The backend has no http-only session cookie, so the client mirrors the JWT
 * into the `drivetrack_token` cookie purely for this check (see
 * lib/axios.ts persistToken). Cookie presence is a navigation gate only —
 * every API call still carries `Authorization: Bearer <token>` and the backend
 * re-verifies it (backend/src/middleware/auth.js). The cookie value is never
 * validated cryptographically here; a forged cookie simply fails at the API.
 */

const TOKEN_COOKIE = "drivetrack_token";

/**
 * Routes that require a session (see config.matcher below — keep the two in
 * sync: the matcher decides whether the proxy RUNS, this decides what it does).
 * Every entry also guards its nested paths (`/home`, `/home/...`).
 *
 * These three are the only role roots in this migration: the bottom nav links
 * exclusively to /admin/*, /home/* and /enforcer/*, and the old standalone
 * screens (/violations, /chat, /learning, /notifications, /profile) now live
 * nested under /home — so they need no prefix of their own.
 */
const PROTECTED_PREFIXES = ["/admin", "/home", "/enforcer"] as const;

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
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const hasSession = Boolean(token);

  // 1. Signed-out → protected routes go to /login, remembering where they
  //    were headed so login can send them back.
  if (isProtectedPath(pathname) && !hasSession) {
    const url = new URL("/login", request.url);
    const next = `${pathname}${request.nextUrl.search}`;
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  // 2. Signed-in → /login and /register bounce to the caller's role home.
  //    The proxy can't reliably know the role (cookie is unsigned-checked),
  //    so it decodes the claim and falls back to the driver home.
  if (AUTH_PATHS.has(pathname) && hasSession && token) {
    return NextResponse.redirect(new URL(homeForRole(roleFromToken(token)), request.url));
  }

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
