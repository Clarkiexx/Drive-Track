"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

import BrandMark from "@/components/common/BrandMark";
import {
  ADMIN_SECTIONS,
  adminHref,
  adminSectionForPath,
} from "@/components/common/adminNav";
import { useAuth } from "@/context/AuthContext";

type AdminSidebarProps = {
  /** Drawer state below the large breakpoint; the rail is always open above it. */
  open: boolean;
  onClose: () => void;
};

/**
 * The console's left rail: DriveTrack brand, the eight sections, and sign-out.
 *
 * A deep forest panel rather than white, so the office reads as a different
 * piece of software from the phone app while still being the same brand. On a
 * narrow window it slides in over the canvas as a drawer.
 */
export default function AdminSidebar({ open, onClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const active = adminSectionForPath(pathname);

  return (
    <aside
      aria-label="Console sections"
      className={`fixed inset-y-0 left-0 z-50 flex w-[17.5rem] flex-col overflow-hidden bg-console-rail text-white shadow-console-rail transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {/* Brand block. Two sweep rings and a little grain keep the large dark
          panel from going flat. */}
      <div className="relative isolate overflow-hidden px-5 pt-6 pb-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full border border-white/8"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-12 -right-4 size-40 rounded-full border border-white/8"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_85%_-15%,rgb(255_255_255/0.12),transparent_58%)]"
        />
        <div aria-hidden className="grain pointer-events-none absolute inset-0 opacity-[0.05]" />

        <div className="relative flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20 ring-inset">
            <BrandMark className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-[18px] leading-none font-semibold tracking-tight text-white">
              DriveTrack
            </p>
            <p className="mt-1 text-[11px] leading-none font-medium text-brand-100/70">
              CTMO Admin Console
            </p>
          </div>
        </div>
      </div>

      {/* The painted centre line, same seam as the phone brand band. */}
      <div aria-hidden className="road-line h-[2px] w-full shrink-0 opacity-60" />

      <nav className="flex-1 overflow-y-auto px-3 py-5">
        <p className="px-2.5 pb-2 text-[10px] font-bold tracking-[0.18em] text-brand-100/45 uppercase">
          Sections
        </p>

        <ul className="space-y-1">
          {ADMIN_SECTIONS.map((section) => {
            const isActive = active?.slug === section.slug;
            const { Icon } = section;

            return (
              <li key={section.slug}>
                <Link
                  href={adminHref(section.slug)}
                  onClick={onClose}
                  aria-current={isActive ? "page" : undefined}
                  className={`group relative flex items-center gap-3 rounded-xl py-2.5 pr-2.5 pl-3.5 text-[13.5px] font-semibold transition-colors duration-200 ${
                    isActive
                      ? "bg-brand-500/25 text-white"
                      : "text-brand-100/70 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  {/* The active item gets an amber rail down its edge — the
                      colour of the centre line in the brand band. */}
                  {isActive ? (
                    <span
                      aria-hidden
                      className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-signal-hold"
                    />
                  ) : null}

                  <Icon
                    size={17}
                    strokeWidth={isActive ? 2.3 : 1.9}
                    className={isActive ? "text-white" : "text-brand-100/55"}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{section.label}</span>

                  {section.ready ? null : (
                    <span className="shrink-0 rounded-full bg-white/8 px-1.5 py-[2px] text-[9px] leading-none font-bold tracking-[0.12em] text-brand-100/55 uppercase">
                      Planned
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-white/10 p-3">
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-brand-100/75 transition-colors hover:bg-white/8 hover:text-white"
        >
          <LogOut size={16} strokeWidth={2.2} aria-hidden />
          Sign out
        </button>
      </div>
    </aside>
  );
}