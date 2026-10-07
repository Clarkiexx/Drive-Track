"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ADMIN_ROOT } from "@/components/common/adminNav";

/** True for /admin and everything under it — the desktop office console. */
export function isAdminPath(pathname: string | null): boolean {
  return pathname === ADMIN_ROOT || (pathname?.startsWith(`${ADMIN_ROOT}/`) ?? false);
}

type AppShellProps = {
  children: ReactNode;
};

/**
 * Picks the shell a route runs inside.
 *
 * Driver, enforcer and auth screens are phones: a 390px-wide column with the
 * bottom tab bar. The admin console is an office: it fills the browser and
 * brings its own sidebar and topbar (app/admin/layout.tsx), so the phone frame
 * must not wrap it.
 *
 * The check is the pathname because the shell lives in the root layout, which
 * every route shares. A pathname that is not known yet falls back to the phone
 * frame — the safer default, since the mobile screens are the ones that cannot
 * cope without it.
 */
export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  if (isAdminPath(pathname)) return <>{children}</>;

  // The phone frame. max-w-md keeps the shell readable when this is opened on a
  // desktop browser for review.
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas shadow-float">
      {children}
    </div>
  );
}