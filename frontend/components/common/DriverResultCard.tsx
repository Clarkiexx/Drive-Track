import Link from "next/link";
import { ChevronRight } from "lucide-react";

type DriverResultCardProps = {
  firstName: string;
  lastName: string;
  licenseNumber: string;
  href: string;
  /** Extra line under the licence number, e.g. the verification state. */
  note?: string;
  className?: string;
};

/**
 * One hit from driver search. Search is licence-number only, so the licence
 * number is the identifying line rather than a secondary detail.
 */
export default function DriverResultCard({
  firstName,
  lastName,
  licenseNumber,
  href,
  note,
  className = "",
}: DriverResultCardProps) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl border border-hairline bg-surface p-4 transition-colors duration-150 hover:border-brand-300 active:bg-surface-sunken ${className}`}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft font-display text-[14px] font-bold text-brand-700">
        {firstName.charAt(0)}
        {lastName.charAt(0)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-ink">
          {firstName} {lastName}
        </span>
        <span className="tabular mt-0.5 block truncate text-[13px] text-muted">
          {licenseNumber}
        </span>
        {note ? <span className="mt-1 block text-[12px] text-signal-hold">{note}</span> : null}
      </span>

      <ChevronRight size={18} strokeWidth={2.2} aria-hidden className="shrink-0 text-muted" />
    </Link>
  );
}