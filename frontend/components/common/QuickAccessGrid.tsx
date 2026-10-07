import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export type QuickActionTone =
  | "danger"
  | "info"
  | "warn"
  | "brand"
  | "ember";

/** The icon-box fills used by both home screens' quick-access grids. */
const TONE_CLASS: Record<QuickActionTone, string> = {
  danger: "bg-danger-soft text-signal-stop",
  info: "bg-info-soft text-signal-info",
  warn: "bg-warn-soft text-signal-hold",
  brand: "bg-brand-soft text-brand-500",
  ember: "bg-ember-soft text-signal-hold",
};

export type QuickAction = {
  label: string;
  href: string;
  Icon: LucideIcon;
  tone: QuickActionTone;
  /** Small count badge, e.g. unread notifications. */
  badge?: number;
};

type QuickAccessGridProps = {
  title?: string;
  actions: QuickAction[];
  className?: string;
};

/**
 * Two-column quick-access grid from the driver and enforcer home screens:
 * a 44px tinted icon tile over a 13px semibold label, no border, flat white.
 */
export default function QuickAccessGrid({
  title,
  actions,
  className = "",
}: QuickAccessGridProps) {
  return (
    <section className={`mt-6 ${className}`}>
      {title ? (
        <h2 className="mb-3 px-5 text-[15px] font-bold text-ink">{title}</h2>
      ) : null}

      <div className="grid grid-cols-2 gap-3 px-3.5">
        {actions.map(({ label, href, Icon, tone, badge }) => (
          <Link
            key={href + label}
            href={href}
            className="group flex flex-col items-center rounded-[14px] bg-surface px-2 py-5 text-center transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97]"
          >
            <span
              className={`relative grid size-11 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${TONE_CLASS[tone]}`}
            >
              <Icon size={21} strokeWidth={2} aria-hidden />
              {badge && badge > 0 ? (
                <span className="tabular absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-signal-stop px-1 text-[10px] leading-4 font-bold text-white ring-2 ring-surface">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </span>
            <span className="mt-2.5 text-[13px] leading-tight font-semibold text-ink">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}