import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

type AppBarProps = {
  title: string;
  /** Where the back arrow goes. Omit to render no arrow. */
  backHref?: string;
  /** Rendered on the right — e.g. a filter or overflow control. */
  actions?: ReactNode;
  className?: string;
};

/**
 * Flat header for pushed screens — violations list, citation receipt, the
 * issue-citation wizard, driver search. Those screens in the Expo apps drop the
 * brand row and go straight to a back arrow plus a title on solid
 * colors.primaryDark.
 *
 * Deliberately has no content slot: on the Expo screens anything below the
 * title (the wizard's progress bar, a search field) sits on the page background
 * in --color-muted, which is unreadable on this band. Put it in a sibling
 * instead.
 */
export default function AppBar({
  title,
  backHref,
  actions,
  className = "",
}: AppBarProps) {
  return (
    <header
      className={`brand-band sticky top-0 z-40 isolate overflow-hidden pt-safe ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_15%_-30%,rgb(255_255_255/0.16),transparent_60%)]"
      />
      <div aria-hidden className="grain pointer-events-none absolute inset-0 opacity-[0.045]" />

      <div className="relative mx-auto flex w-full max-w-md items-center gap-3 px-4 pb-[18px]">
        {backHref ? (
          <Link
            href={backHref}
            aria-label={`Back to ${title}`}
            className="-ml-2 grid size-10 shrink-0 place-items-center rounded-full text-white transition-colors hover:bg-white/15"
          >
            <ChevronLeft size={24} strokeWidth={2.2} aria-hidden />
          </Link>
        ) : null}

        <h1 className="min-w-0 flex-1 truncate font-display text-[18px] font-semibold tracking-tight text-white">
          {title}
        </h1>

        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </div>

      <div aria-hidden className="road-line relative h-[2px] w-full opacity-70" />
    </header>
  );
}