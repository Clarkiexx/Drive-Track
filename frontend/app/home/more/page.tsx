"use client";

import Link from "next/link";
import {
  ChartColumn,
  ChevronRight,
  GraduationCap,
  MessageCircleMore,
  UserRound,
} from "lucide-react";

import AppBar from "@/components/common/AppBar";
import BottomNav from "@/components/common/BottomNav";
import PageBody from "@/components/common/PageBody";

/**
 * The driver screens that are not a tab of their own. BottomNav already links to
 * /home/more, so this hub is what keeps that fourth tab from being a dead end —
 * every destination below is reachable from here in one tap. Chat is a tab too,
 * but it is listed so the set is complete.
 */
const DESTINATIONS = [
  {
    label: "Violation Status",
    href: "/home/status",
    Icon: ChartColumn,
    tile: "bg-info-soft text-signal-info",
  },
  {
    label: "Profile",
    href: "/home/profile",
    Icon: UserRound,
    tile: "bg-brand-soft text-brand-600",
  },
  {
    label: "Learning Center",
    href: "/home/learning",
    Icon: GraduationCap,
    tile: "bg-ember-soft text-signal-hold",
  },
  {
    label: "Chatbot",
    href: "/home/chat",
    Icon: MessageCircleMore,
    tile: "bg-violet-soft text-signal-violet",
  },
];

export default function MorePage() {
  return (
    <>
      <AppBar title="More" backHref="/home" />

      <PageBody>
        <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
          Everything else in DriveTrack. Your violations and chat stay one tap away on the bar
          below.
        </p>

        {/* One card, hairline-divided rows — the same list language the admin
            activity feed and the record cards use. */}
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
      </PageBody>

      <BottomNav />
    </>
  );
}