import type { LucideIcon } from "lucide-react";

export type Stat = {
  label: string;
  value: number;
  /** Text colour for the figure. */
  tone?: "info" | "go" | "violet";
  Icon?: LucideIcon;
};

const TONE: Record<NonNullable<Stat["tone"]>, string> = {
  info: "text-signal-info",
  go: "text-go-ink",
  violet: "text-signal-violet",
};

type StatsCardProps = {
  title: string;
  stats: Stat[];
  className?: string;
};

/**
 * The enforcer home "Citations Issued" panel. Overlaps the brand band the same
 * way <StatusCard> does, with the three figures spread across the row.
 */
export default function StatsCard({ title, stats, className = "" }: StatsCardProps) {
  return (
    <section
      className={`rise relative z-50 mx-5 -mt-7 rounded-[14px] bg-surface p-5 shadow-lift ${className}`}
    >
      <p className="text-[13px] text-muted">{title}</p>

      <dl className="mt-3.5 flex items-start justify-around">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col items-center">
            <dt className="sr-only">{stat.label}</dt>
            <dd
              className={`tabular font-display text-[24px] leading-none font-bold ${
                TONE[stat.tone ?? "info"]
              }`}
            >
              {stat.value.toLocaleString("en-US")}
            </dd>
            <dd aria-hidden className="mt-1.5 text-[12px] text-muted">
              {stat.label}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}