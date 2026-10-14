"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/constants/roles";

type Tab = {
  label: string;
  href: string;
  Icon: LucideIcon;
};

type BottomNavProps = {
  /**
   * Overrides the role read from the session. Only needed when a page renders
   * the bar for a role other than the signed-in user's.
   */
  role?: Role;
  /**
   * "full" renders every tab for the role. "home" renders only the first and
   * last tabs (Home + More for both roles) for home screens whose centered
   * buttons already cover the rest.
   */
  variant?: "full" | "home";
};

/* Both roles get a slim two-tab bar — Home and More. The drivers' Violations
   and Chat tabs and the enforcers' Search and Previous tabs used to live
   here, but each lives on its home Quick Access grid and More hub instead. */
const TABS: Record<Role, Tab[]> = {
  driver: [
    { label: "Home", href: "/home", Icon: House },
    { label: "More", href: "/home/more", Icon: LayoutGrid },
  ],
  enforcer: [
    { label: "Home", href: "/enforcer", Icon: House },
    { label: "More", href: "/enforcer/more", Icon: LayoutGrid },
  ],
  // Admins work in the dashboard, which has its own sidebar — no bottom bar.
  admin: [],
};

function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomNav({ role: roleProp, variant = "full" }: BottomNavProps) {
  const pathname = usePathname() ?? "/";
  const { user, isLoading } = useAuth();

  // The session only restores after hydration (AuthContext seeds user=null,
  // isLoading=true), so rendering now would resolve TABS to an entry for the
  // wrong role and flash it. Hold the bar back until the real role is known —
  // SSR renders null too, so server HTML and the first client paint agree.
  if (isLoading) return null;

  // Signed out → no role yet; driver is the harmless placeholder (the admin
  // entry is empty, which used to render nothing and then pop in).
  const allTabs = TABS[roleProp ?? user?.role ?? "driver"];
  const tabs =
    variant === "home" && allTabs.length > 1
      ? [allTabs[0], allTabs[allTabs.length - 1]]
      : allTabs;
  if (tabs.length === 0) return null;

  // Pick the most specific match so a nested page (e.g. /home/violations
  // under the driver's Home tab) lights up its closest tab.
  let activeIndex = -1;
  let bestLength = -1;
  tabs.forEach((tab, index) => {
    if (matches(pathname, tab.href) && tab.href.length > bestLength) {
      bestLength = tab.href.length;
      activeIndex = index;
    }
  });

  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md">
      {/* Blurred white so list content scrolling underneath stays legible but
          clearly separated. pb-safe clears the home indicator on notched phones. */}
      <div className="border-t border-hairline bg-surface/82 pb-safe shadow-[0_-1px_0_rgb(255_255_255/0.6)_inset,0_-12px_28px_-22px_rgb(16_42_20/0.5)] backdrop-blur-xl">
        <div className="relative flex items-stretch px-1.5 pt-1.5">
          {/* One indicator that slides between tabs instead of four separate
              fades — the eye follows a single moving object. It carries both
              the top rail and the pill so the two always agree. */}
          {activeIndex >= 0 ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                width: `${100 / tabs.length}%`,
                transform: `translateX(${activeIndex * 100}%)`,
              }}
            >
              <span className="absolute inset-x-3 top-0 h-[3px] rounded-full bg-brand-500" />
              <span className="absolute inset-x-3 top-1.5 bottom-0 rounded-xl bg-brand-50/80" />
            </span>
          ) : null}

          {tabs.map(({ label, href, Icon }) => {
            const active = matches(pathname, href);

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-13 flex-1 flex-col items-center justify-center gap-1 px-1 pt-1.5 pb-1.5 transition-colors duration-200 ${
                  active ? "text-brand-700" : "text-muted"
                }`}
              >
                <span
                  className={`transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    active ? "-translate-y-px scale-105" : "scale-100"
                  }`}
                >
                  <Icon size={21} strokeWidth={active ? 2.4 : 1.9} aria-hidden />
                </span>
                <span
                  className={`text-[10.5px] leading-none tracking-wide ${
                    active ? "font-bold" : "font-medium"
                  }`}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}