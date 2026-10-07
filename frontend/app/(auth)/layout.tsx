import type { ReactNode } from "react";

/** The road glyph from the app icon, used on the auth hero. */
function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M9.6 4.6h4.8l3.1 14.8H6.5L9.6 4.6Z" fill="currentColor" fillOpacity="0.95" />
      <path
        d="M11.62 7.4h.76l.26 2.1h-1.28l.26-2.1Zm.5 4.3h1.02l.32 2.6h-1.66l.32-2.6Zm.52 4.9h1.3l.2 1.6h-1.7l.2-1.6Z"
        fill="#D97706"
      />
    </svg>
  );
}

/**
 * Shared frame for the signed-out screens: the same brand gradient, sweep
 * rings and road seam as MobileHeader, without the per-account content a
 * signed-in screen carries.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <div className="brand-band relative isolate overflow-hidden pt-safe">
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

        <div className="relative mx-auto flex w-full max-w-md flex-col items-center px-5 pt-10 pb-12">
          <span className="grid size-14 place-items-center rounded-full bg-white/12 text-white ring-2 ring-white/90">
            <BrandMark className="size-7" />
          </span>
          <p className="font-display mt-3 text-[26px] leading-none font-semibold tracking-tight text-white">
            DriveTrack
          </p>
          <p className="mt-2 text-[13px] text-brand-100/80">
            City Traffic Management Office
          </p>
        </div>

        <div aria-hidden className="road-line relative h-[2px] w-full opacity-70" />
      </div>

      {/* The card each screen renders pulls itself up into this gap. */}
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-6">
        {children}
      </div>
    </div>
  );
}