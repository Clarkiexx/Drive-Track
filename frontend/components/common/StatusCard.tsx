import type { ReactNode } from "react";
import { CircleCheckBig, TriangleAlert } from "lucide-react";

type StatusCardProps = {
  /** Small grey line above the value, e.g. "Current Status". */
  label: string;
  /** The headline, e.g. "2 Unsettled Violations". */
  value: string;
  /**
   * "clear" for nothing outstanding, "attention" when something needs action.
   * Drives the icon, the value colour and whether a notice block appears.
   */
  tone?: "clear" | "attention";
  /** Amber inset under the row, e.g. "Please settle to avoid penalties." */
  notice?: string;
  /** Trailing control on the row — a link or a small action. */
  action?: ReactNode;
  /** Stagger hook for the entrance animation. */
  className?: string;
};

/**
 * The white card that overlaps the brand band on both home screens.
 *
 * It carries its own -28px pull so it tucks under the band edge, and sits at
 * z-50 — above the header's z-40 — so its own surface covers the band rather
 * than the band swallowing the card's first line. Set <MobileHeader bleed>
 * instead when nothing overlaps.
 */
export default function StatusCard({
  label,
  value,
  tone = "clear",
  notice,
  action,
  className = "",
}: StatusCardProps) {
  const attention = tone === "attention";
  const Icon = attention ? TriangleAlert : CircleCheckBig;

  return (
    <section
      className={`rise relative z-50 mx-5 -mt-7 rounded-[14px] bg-surface p-[18px] shadow-lift ${className}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-full ${
            attention ? "bg-warn-soft text-signal-hold" : "bg-brand-soft text-brand-500"
          }`}
        >
          <Icon size={19} strokeWidth={2.2} aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[12px] leading-none text-muted">{label}</p>
          <p
            className={`font-display mt-1 text-[16px] leading-tight font-semibold ${
              attention ? "text-signal-hold" : "text-ink"
            }`}
          >
            {value}
          </p>
        </div>

        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {notice ? (
        <p className="mt-3 rounded-lg bg-warn-notice p-2.5 text-[12px] leading-snug text-warn-ink">
          {notice}
        </p>
      ) : null}
    </section>
  );
}