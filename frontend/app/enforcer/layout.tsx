"use client";

import type { ReactNode } from "react";

import RoleGate from "@/components/common/RoleGate";

/**
 * /enforcer/* is the field workflow — drivers and admins have no business
 * here. proxy.ts merely proves a token cookie exists, so this layout adds the
 * role check that keeps them out before any citation screen renders.
 */
export default function EnforcerLayout({ children }: { children: ReactNode }) {
  return <RoleGate allow="enforcer">{children}</RoleGate>;
}
