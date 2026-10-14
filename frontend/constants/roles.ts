/**
 * Roles issued by the backend (backend/src/utils/jwt.js → { id, role }).
 * Single source of truth for role names + the landing route each role gets
 * after login and from proxy.ts.
 */

export const ROLES = ["driver", "enforcer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Landing route per role after a successful login (and for proxy.ts redirects). */
export const ROLE_HOME: Record<Role, string> = {
  driver: "/home",
  enforcer: "/enforcer",
  admin: "/admin/dashboard",
};

/** Role-safe lookup — unknown/legacy tokens fall back to the driver home. */
export function homeForRole(role: unknown): string {
  return isRole(role) ? ROLE_HOME[role] : ROLE_HOME.driver;
}

export function isDriver(role: unknown): role is "driver" {
  return role === "driver";
}

export function isEnforcer(role: unknown): role is "enforcer" {
  return role === "enforcer";
}

export function isAdmin(role: unknown): role is "admin" {
  return role === "admin";
}
