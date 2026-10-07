import type { Role } from "@/constants/roles";

/**
 * Works out where to send someone after a successful login.
 *
 * The proxy sends signed-out visitors to /login?next=<where they were>, so this
 * has to decide whether to honour it. Two rules:
 *
 *   1. It must be a path on this origin. A value starting with "//" is
 *      protocol-relative and would bounce the user to another site.
 *   2. It must belong to the role that just signed in. Without this, a driver
 *      could be handed ?next=/admin/dashboard — the proxy would allow it (it
 *      only checks that a token cookie exists) and the admin shell would render
 *      for someone with no admin rights.
 */

/** URL space each role owns. Not the same as ROLE_HOME — admin's home is
 *  /admin/dashboard but the whole /admin tree belongs to admins. */
const ROLE_NAMESPACE: Record<Role, string> = {
  driver: "/home",
  enforcer: "/enforcer",
  admin: "/admin",
};

/** /change-password is a driver-only flow, so it is allowed for drivers. */
const DRIVER_ONLY_PATHS = new Set(["/change-password"]);

export function resolveNextTarget(raw: string | null, role: Role): string | null {
  if (!raw) return null;

  // Must be an absolute path on this origin. Reject "//host" and "/\host",
  // both of which browsers treat as protocol-relative.
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;

  const path = raw.split(/[?#]/)[0] ?? "";

  if (role === "driver" && DRIVER_ONLY_PATHS.has(path)) return raw;

  const namespace = ROLE_NAMESPACE[role];
  if (path === namespace || path.startsWith(`${namespace}/`)) return raw;

  return null;
}