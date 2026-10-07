"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ADMIN_ROOT } from "@/components/common/adminNav";

/** True for /admin and everything under it — the desktop office console. */
export function isAdminPath(pathname: string | null): boolean {
  return pathname === ADMIN_ROOT || (pathname?.startsWith(`${ADMIN_ROOT}/`) ?? false);
}

/**
 * The signed-out screens. They need the phone frame on a phone (the driver and
 * enforcer sign in from one) but NOT on a laptop: the same person who installs
 * DriveTrack as a PWA also signs in on a desktop, and a 390px column marooned
 * in a wide window reads as broken rather than intentional.
 *
 * So the frame below is released at `lg` for these routes only — everything
 * under /home and /enforcer keeps it at every width, because those workspaces
 * are the phone frame (tab bar, safe-area padding, 390px layout).
 */
const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/change-password"] as const;

export function isAuthPath(pathname: string | null): boolean {
  return AUTH_ROUTES.some((route) => pathname === route);
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
 *
 * Auth routes get `lg:max-w-none` rather than being dropped entirely: that lets
 * the (auth) layout compose a real desktop view from the same DOM, instead of
 * having to escape this frame with a position:fixed overlay.
 */
export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  if (isAdminPath(pathname)) return <>{children}</>;

  // The phone frame. max-w-md keeps the shell readable when this is opened on a
  // desktop browser for review.
  return (
    <div
      className={`mx-auto flex min-h-dvh w-full flex-col bg-canvas shadow-float ${
        isAuthPath(pathname) ? "max-w-md lg:max-w-none lg:shadow-none" : "max-w-md"
      }`}
    >
      {children}
    </div>
  );
}