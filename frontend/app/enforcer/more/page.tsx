"use client";

import Link from "next/link";
import {
  Bell,
  ChevronRight,
  ClipboardList,
  LogOut,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";

import AppBar from "@/components/common/AppBar";
import BottomNav from "@/components/common/BottomNav";
import PageBody from "@/components/common/PageBody";
import { useAuth } from "@/context/AuthContext";

/**
 * The enforcer More hub — the counterpart to app/home/more/page.tsx, and the
 * same pattern: an AppBar, a one-line explanation, then one card of
 * hairline-divided rows. BottomNav already links /enforcer/more as its fourth
 * tab, so without this screen that tab is a dead end.
 *
 * What it lists is exactly what exists in the enforcer tree. "My Profile" from
 * the RN quick-actions grid is NOT here: /enforcer/profile is not part of this
 * migration, and a row that lands on a 404 is worse than a missing row. Add it
 * the day the profile screen lands.
 */
const DESTINATIONS: { label: string; href: string; Icon: LucideIcon; tile: string }[] = [
  {
    label: "Issue Citation",
    href: "/enforcer/issue",
    Icon: ClipboardList,
    tile: "bg-brand-soft text-brand-600",
  },
  {
    label: "Search Driver",
    href: "/enforcer/search",
    Icon: ScanSearch,
    tile: "bg-info-soft text-signal-info",
  },
  {
    label: "Previous Citations",
    href: "/enforcer/previous",
    Icon: ClipboardList,
    tile: "bg-ember-soft text-signal-hold",
  },
  {
    label: "Notifications",
    href: "/enforcer/notifications",
    Icon: Bell,
    tile: "bg-warn-soft text-signal-hold",
  },
];

export default function EnforcerMorePage() {
  const { user, logout } = useAuth();

  return (
    <>
      <AppBar title="More" backHref="/enforcer" />

      <PageBody>
        <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
          Everything else in DriveTrack. Home, Search Driver and Previous Citations stay one tap away
          on the bar below.
        </p>

        {/* One card, hairline-divided rows — the same list language the driver
            More hub and the admin activity feed use. */}
        <ul className="mt-4 overflow-hidden rounded-[14px] bg-surface">
          {DESTINATIONS.map(({ label, href, Icon, tile }) => (
            <li key={href} className="border-b border-hairline last:border-b-0">
              <Link
                href={href}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-brand-50 active:bg-surface-sunken"
              >
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tile}`}>
                  <Icon size={18} strokeWidth={2} aria-hidden />
                </span>

                <span className="min-w-0 flex-1 text-[14px] font-semibold text-ink">{label}</span>

                <ChevronRight size={18} strokeWidth={2.2} aria-hidden className="shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>

        {/* The RN Profile screen owned signing out; with no profile screen to
            own it, the hub carries it instead of leaving the officer no way off
            this account. */}
        <div className="mt-6 rounded-[14px] border border-hairline bg-surface p-4">
          <p className="text-[14px] font-semibold text-ink">
            {user ? `Officer ${user.lastName}` : "Officer"}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {user ? `${user.firstName} ${user.lastName}`.trim() : "Not signed in"}
          </p>

          <button
            type="button"
            onClick={logout}
            className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-[10px] bg-signal-stop py-3 text-[14px] font-semibold text-white transition-colors hover:bg-signal-stop/90"
          >
            <LogOut size={16} strokeWidth={2.2} aria-hidden />
            Sign out
          </button>
        </div>
      </PageBody>

      <BottomNav />
    </>
  );
}