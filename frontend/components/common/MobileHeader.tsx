import Link from "next/link";
import type { ReactNode } from "react";

import BrandMark from "@/components/common/BrandMark";

type MobileHeaderProps = {
  /** Small uppercase line above the title, e.g. "Welcome back". */
  eyebrow?: string;
  /** The screen's main line, e.g. a person's name. */
  title?: string;
  /** Rendered under the title — verification banners, status pills, etc. */
  status?: ReactNode;
  /** Trailing controls: notifications, profile, sign out. */
  actions?: ReactNode;
  /**
   * Reserve a well of extra band below the title, for screens that scroll plain
   * content instead of tucking an overlapping card under the band. Leave it off
   * when the next element is a <StatusCard>, which overlaps by design.
   */
  bleed?: boolean;
  className?: string;
};

export default function MobileHeader({
  eyebrow,
  title,
  status,
  actions,
  bleed = false,
  className = "",
}: MobileHeaderProps) {
  const hasTitleBlock = Boolean(eyebrow || title || status);

  return (
    <header
      className={`brand-band sticky top-0 z-40 isolate overflow-hidden pt-safe ${className}`}
    >
      {/* Depth, built from four cheap layers rather than one flat fill:
          two off-canvas sweep rings, a corner highlight, and fine grain. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 -right-20 size-72 rounded-full border border-white/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-14 -right-8 size-44 rounded-full border border-white/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_85%_-15%,rgb(255_255_255/0.22),transparent_58%)]"
      />
      <div aria-hidden className="grain pointer-events-none absolute inset-0 opacity-[0.045]" />

      <div className="relative mx-auto flex w-full max-w-md items-center gap-3 px-5 pt-3 pb-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15 text-white ring-1 ring-white/25 ring-inset">
          <BrandMark className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px] leading-none font-semibold tracking-tight text-white">
            DriveTrack
          </p>
          <p className="mt-1 truncate text-[11px] leading-none font-medium text-brand-100/75">
            City Traffic Management Office
          </p>
        </div>

        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </div>

      {hasTitleBlock ? (
        /* pb-9 leaves 36px of band under the title. A <StatusCard> pulls itself
           28px up into that space, so 8px of green still shows — the same
           overlap the Expo home screen gets from paddingBottom 20 / marginTop -14. */
        <div className={`relative mx-auto w-full max-w-md px-5 ${bleed ? "pb-16" : "pb-9"}`}>
          {eyebrow ? (
            <p className="rise text-[11px] font-semibold tracking-[0.16em] text-brand-100/80 uppercase">
              {eyebrow}
            </p>
          ) : null}
          {title ? (
            <h1 className="rise font-display mt-1.5 text-[26px] leading-[1.1] font-semibold tracking-tight text-white [animation-delay:60ms]">
              {title}
            </h1>
          ) : null}
          {status ? <div className="rise mt-2.5 [animation-delay:120ms]">{status}</div> : null}
        </div>
      ) : null}

      {/* Painted centre line closing the band. */}
      <div aria-hidden className="road-line relative h-[2px] w-full opacity-70" />
    </header>
  );
}