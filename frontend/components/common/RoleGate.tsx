"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/context/AuthContext";
import { homeForRole, type Role } from "@/constants/roles";

/**
 * Client-side role guard for a route tree.
 *
 * WHY it exists: proxy.ts can only prove that the `drivetrack_token` cookie is
 * PRESENT — it never verifies the signature and never gates on the role claim —
 * so a signed-in driver could open /admin/dashboard and the whole admin shell
 * would render, collecting 403s from every API call behind it. This component
 * re-checks the role once the session restores and bounces anyone in the wrong
 * workspace. It is UX, not security: every backend route still runs
 * `allowRoles(...)` (backend/src/middleware/auth.js), which remains the real
 * authority on who may see the data.
 */

type RoleGateProps = {
  /** Role (or roles) allowed through; anyone else is sent to their role home. */
  allow: Role | Role[];
  children: ReactNode;
  /**
   * When true, a driver who still owes a password change is sent to
   * /change-password instead of being admitted. Set it on the driver tree
   * only: the backend's auth middleware 403s every route except
   * POST /auth/driver/change-password for such a token, so letting one render
   * produced a signed-in app whose every request failed.
   */
  blockUntilPasswordChange?: boolean;
};

export default function RoleGate({
  allow,
  children,
  blockUntilPasswordChange = false,
}: RoleGateProps) {
  const { user, isLoading, mustChangePassword } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  // Callers may pass an inline array literal (a fresh identity on every
  // render), so key the memo on the contents instead — the redirect effect
  // below then only re-runs when the allowed set actually changes. Role names
  // never contain a comma, so join/split round-trips safely.
  const allowKey = Array.isArray(allow) ? allow.join(",") : allow;
  const allowedRoles = useMemo(() => allowKey.split(","), [allowKey]);

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      // Signed out (cleared storage, stale cookie) → /login, remembering the
      // path so login can send the user straight back. The search string is
      // read from window.location inside the effect rather than via
      // useSearchParams(), which would force a <Suspense> boundary around
      // every page mounting this gate.
      const next = `${pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      // Wrong workspace for this role (e.g. a driver on /admin/dashboard) →
      // their own home. proxy.ts cannot make this call for us: it never
      // validates the cookie, so the decoded claim can't be trusted there.
      router.replace(homeForRole(user.role));
      return;
    }

    // Belt-and-braces behind the login redirects: a session restored from
    // localStorage can still carry the flag (an older session, or one created
    // before the login flow learned about it). Landing here would render a
    // shell whose every fetch 403s.
    if (blockUntilPasswordChange && mustChangePassword) {
      router.replace("/change-password");
    }
  }, [isLoading, user, allowedRoles, pathname, router, blockUntilPasswordChange, mustChangePassword]);

  // AuthContext always starts at isLoading=true on the server AND on the first
  // client paint, so returning null here keeps the SSR output and the hydrated
  // tree identical — no flash of the wrong shell, no hydration mismatch.
  if (isLoading) return null;

  // Signed out or wrong role: render nothing while the effect above redirects.
  // The redirect must never run during render (React only allows navigation
  // from effects on the client), so the guarded children stay hidden meanwhile.
  if (!user || !allowedRoles.includes(user.role)) return null;

  if (blockUntilPasswordChange && mustChangePassword) return null;

  return <>{children}</>;
}
