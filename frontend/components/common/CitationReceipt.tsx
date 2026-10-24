import { CalendarDays, CreditCard, MapPin } from "lucide-react";

import type { SettlementStatus } from "@/constants/violations";
import { formatPeso, formatShortDate } from "./dates";
import StatusChip from "./StatusChip";

/* The panels on the citation receipt, lifted out of ViolationDetailScreen. */

type ViolationsBoxProps = {
  /** Already-resolved descriptions from the violation types table. */
  violations?: string[];
  /** Free-text violation the officer typed when no type fitted. */
  otherViolation?: string;
  className?: string;
};

/** Pale-red panel listing every violation on the citation. */
export function ViolationsBox({
  violations = [],
  otherViolation,
  className = "",
}: ViolationsBoxProps) {
  const lines = [
    ...violations.filter(Boolean),
    ...(otherViolation ? [otherViolation] : []),
  ];

  return (
    <div className={`mb-3.5 rounded-[10px] bg-danger-soft p-3.5 ${className}`}>
      <p className="mb-1.5 text-[12px] font-bold text-signal-stop">Violations</p>
      {lines.length === 0 ? (
        <p className="text-[13px] text-signal-stop">No violation details recorded.</p>
      ) : (
        <ul className="space-y-0.5">
          {lines.map((line) => (
            <li key={line} className="text-[13px] leading-snug text-signal-stop">
              • {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type FineBoxProps = {
  fineAmount: string | number;
  status: SettlementStatus;
  settlementLabel: string;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  /**
   * Due-date line shown under the settlement status while still pending.
   * Pass the label from `dueInfo(dueDate, now).label`. Kept as a string so the
   * component stays free of the client-clock hydration dance in useClientNow.
   */
  dueNote?: string;
  /** Primary action, e.g. the hosted checkout button. */
  action?: React.ReactNode;
  /** Amber note under the action, e.g. payment awaiting confirmation. */
  pendingNote?: string;
  /* Optional partial-payment rollups (driver receipt only). When several
   * violations have been settled against a still-pending citation, the
   * remaining balance is promoted above the original total. Omitting all of
   * them keeps the panel identical for legacy callers. */
  paidAmount?: number;
  remainingAmount?: number;
  partiallyPaid?: boolean;
  /** What the driver has ticked for the next payment, if a list is present. */
  paySelection?: { amount: number; count: number } | null;
  className?: string;
};

/**
 * The centred pale-green panel holding the total fine, its settlement state and
 * the pay button. Hidden entirely for warning records, which carry no fine.
 */
export function FineBox({
  fineAmount,
  status,
  settlementLabel,
  paymentMethod,
  paymentReference,
  dueNote,
  action,
  pendingNote,
  paidAmount,
  remainingAmount,
  partiallyPaid,
  paySelection,
  className = "",
}: FineBoxProps) {
  const overdue = status === "pending";
  const showPartial =
    status === "pending" &&
    partiallyPaid === true &&
    typeof remainingAmount === "number" &&
    remainingAmount > 0;

  return (
    <div className={`mb-3.5 rounded-[10px] bg-brand-soft p-3.5 text-center ${className}`}>
      {showPartial ? (
        <>
          <p className="text-[12px] leading-snug text-muted">
            Total Fine {formatPeso(fineAmount)}
            {typeof paidAmount === "number" ? ` — paid so far ${formatPeso(paidAmount)}` : ""}
          </p>
          <p className="mt-2 text-[11px] uppercase tracking-wide text-muted">
            Remaining Balance
          </p>
          <p className="tabular font-display mt-0.5 text-[22px] leading-tight font-bold text-signal-hold">
            {formatPeso(remainingAmount)}
          </p>
        </>
      ) : (
        <>
          <p className="text-[12px] text-muted">Total Fine</p>
          <p className="tabular font-display mt-0.5 text-[22px] leading-tight font-bold text-brand-700">
            {formatPeso(fineAmount)}
          </p>
        </>
      )}
      <p
        className={`mt-1 text-[12px] font-semibold ${
          overdue ? "text-signal-hold" : status === "settled" ? "text-go-ink" : "text-ink"
        }`}
      >
        {settlementLabel}
      </p>

      {status === "pending" && dueNote ? (
        <p className="mt-1 text-[12px] font-semibold leading-snug text-muted">{dueNote}</p>
      ) : null}

      {status === "pending" && paySelection ? (
        <p className="mt-1.5 text-[12px] font-semibold leading-snug text-brand-700">
          {paySelection.count === 0
            ? "No violations selected"
            : `Selected: ${formatPeso(paySelection.amount)} — ${paySelection.count} ${
                paySelection.count === 1 ? "violation" : "violations"
              }`}
        </p>
      ) : null}

      {status === "settled" && paymentMethod ? (
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[12px] text-muted">
          <CreditCard size={13} strokeWidth={2} aria-hidden />
          Paid via {paymentMethod}
          {paymentReference ? ` • ${paymentReference}` : ""}
        </p>
      ) : null}

      {action ? <div className="mt-3">{action}</div> : null}

      {pendingNote ? (
        <p className="mt-2.5 text-[12px] font-semibold leading-snug text-signal-hold">
          {pendingNote}
        </p>
      ) : null}
    </div>
  );
}

export type InfoRowProps = {
  label: string;
  value: string;
  /** Shows a small leading icon for the common rows. */
  icon?: "calendar" | "map" | "none";
  className?: string;
};

/** Label-over-value row used throughout the receipt. */
export function InfoRow({ label, value, icon = "none", className = "" }: InfoRowProps) {
  const Icon = icon === "calendar" ? CalendarDays : icon === "map" ? MapPin : null;

  return (
    <div className={`mb-3 ${className}`}>
      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        {Icon ? <Icon size={12} strokeWidth={2.2} aria-hidden /> : null}
        {label}
      </p>
      <p className="mt-0.5 text-[14px] leading-snug font-semibold text-ink">{value}</p>
    </div>
  );
}

type EvidenceStripProps = {
  photos: { url: string; name?: string }[];
  label?: string;
  className?: string;
};

/** Photo-evidence strip. Same 70px tiles as the wizard's thumbnails. */
export function EvidenceStrip({
  photos,
  label = "Photo Evidence",
  className = "",
}: EvidenceStripProps) {
  if (photos.length === 0) return null;

  return (
    <div className={`mt-2.5 ${className}`}>
      <p className="mb-1.5 text-[11px] text-muted">{label}</p>
      <ul className="flex flex-wrap gap-2.5">
        {photos.map((photo, index) => (
          <li key={`${photo.url}-${index}`}>
            {/* Evidence URLs come from the media service and may be any origin. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.name ? `${label}: ${photo.name}` : `${label} ${index + 1}`}
              className="size-[70px] rounded-lg border border-hairline object-cover"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export { formatShortDate, StatusChip };