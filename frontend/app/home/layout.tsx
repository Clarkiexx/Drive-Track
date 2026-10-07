"use client";

import type { ReactNode } from "react";

import RoleGate from "@/components/common/RoleGate";

/**
 * /home/* is the driver workspace only — enforcers and admins land on their
 * own roots (/enforcer, /admin/dashboard). proxy.ts merely proves a token
 * cookie exists, so this layout adds the role check that keeps the other two
 * roles out before a single driver screen renders.
 *
 * `blockUntilPasswordChange` covers the other half of the same problem: a
 * driver whose mustChangePassword flag is set gets a 403 from the backend on
 * every route except change-password, so rendering their home would show a
 * shell over failing requests. The login redirect already handles the common
 * path; this catches a session restored from storage that still carries it.
 */
export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate allow="driver" blockUntilPasswordChange>
      {children}
    </RoleGate>
  );
}
