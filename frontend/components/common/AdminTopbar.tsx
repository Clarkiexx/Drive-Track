"use client";

import { usePathname } from "next/navigation";
import { BadgeCheck, Menu } from "lucide-react";

import { adminSectionForPath } from "@/components/common/adminNav";
import { useAuth } from "@/context/AuthContext";

type AdminTopbarProps = {
  /** Opens the section rail on narrow windows. */
  onToggleNav: () => void;
};

/**
 * The console's top bar: which section you are in, who is signed in, and the
 * role badge that reminds an administrator this is the privileged surface.
 *
 * Sticky with a blurred white fill, so a long table scrolls under it and the
 * page title stays put.
 */
export default function AdminTopbar({ onToggleNav }: AdminTopbarProps) {
  const pathname = usePathname();
  const { user } = useAuth();

  const section = adminSectionForPath(pathname);
  const firstName = user?.firstName?.trim() ?? "";
  const lastName = user?.lastName?.trim() ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const displayName = fullName || "CTMO Office";

  // Two initials, falling back to the office short name while the stored
  // session is still being read back.
  const initials = fullName
    ? `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
    : "CTMO";

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-console-line bg-surface/85 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-5 py-3.5 lg:px-8">
        <button
          type="button"
          onClick={onToggleNav}
          aria-label="Open console sections"
          className="-ml-1 grid size-9 shrink-0 place-items-center rounded-lg text-console-muted transition-colors hover:bg-console-canvas hover:text-ink lg:hidden"
        >
          <Menu size={20} strokeWidth={2.1} aria-hidden />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] leading-none font-bold tracking-[0.18em] text-brand-600 uppercase">
            Admin console
          </p>
          <h1 className="font-display mt-1.5 text-[19px] leading-none font-semibold tracking-tight text-ink">
            {section?.label ?? "Console"}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden items-center gap-1.5 rounded-full border border-brand-200 bg-brand-soft px-2.5 py-1 text-[11.5px] leading-none font-bold text-brand-700 sm:inline-flex">
            <BadgeCheck size={13} strokeWidth={2.6} aria-hidden />
            Administrator
          </span>

          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-console-rail text-[12px] font-bold tracking-wide text-white"
          >
            {initials}
          </span>

          <span className="hidden min-w-0 leading-tight sm:block">
            <span className="block truncate text-[13px] font-semibold text-ink">{displayName}</span>
            <span className="mt-0.5 block truncate text-[11px] text-console-muted">
              City Traffic Management Office
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}