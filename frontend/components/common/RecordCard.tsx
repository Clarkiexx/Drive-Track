"use client";

import Link from "next/link";
import { CalendarDays, ChevronRight, Clock, MapPin, ScrollText, TriangleAlert } from "lucide-react";

import type { RecordType, SettlementStatus } from "@/constants/violations";
import { dueInfo, formatPeso, formatShortDate, formatShortDateManila, type DueUrgency } from "./dates";
import useClientNow from "./useClientNow";
import StatusChip from "./StatusChip";

type DueLineProps = {
  dueDate: string | number | Date;
};

const URGENCY_CLASS: Record<DueUrgency, string> = {
  normal: "text-muted",
  soon: "font-semibold text-signal-hold",
  overdue: "font-bold text-signal-stop",
};

/**
 * The due-date line from MyViolationsScreen, including its amber "3 days left"
 * and red "Overdue" escalation.
 *
 * Before hydration it shows the plain date; afterwards it upgrades to the
 * urgency wording. See useClientNow for why.
 */
export function DueLine({ dueDate }: DueLineProps) {
  const now = useClientNow();

  const info = now === null ? null : dueInfo(dueDate, now);

  return (
    <p
      className={`mt-1.5 flex items-center gap-1.5 text-[12px] leading-snug ${
        info ? URGENCY_CLASS[info.urgency] : "text-muted"
      }`}
    >
      {info?.urgency === "overdue" ? (
        <TriangleAlert size={13} strokeWidth={2.4} aria-hidden className="shrink-0" />
      ) : (
        <Clock size={13} strokeWidth={2.2} aria-hidden className="shrink-0" />
      )}
      {info ? info.label : `Due ${formatShortDate(dueDate)}`}
    </p>
  );
}

export type RecordCardProps = {
  citationNumber: string;
  title: string;
  status: SettlementStatus;
  /**
   * Widened past the backend's real values on purpose. The Prisma enum has a
   * third member, "violation", that citationController never writes — but a
   * hand-rolled or legacy row could still carry it, and this card has to render
   * something rather than fall over. Anything that isn't "warning" is styled
   * and labelled as a citation, which is the safe reading.
   */
  recordType: RecordType;
  occurredAt: string | number | Date;
  placeOfViolation: string;
  fineAmount?: string | number | null;
  dueDate?: string | number | Date | null;
  /** Makes the whole card a link. */
  href?: string;
  /** Trailing link label on the card footer. Defaults to "View Receipt". */
  footerLink?: string;
};

/**
 * One row of the violations list. Hairline border and no shadow, matching the
 * flat white cards in MyViolationsScreen; the fine and the receipt link sit
 * below a hairline rule.
 */
export default function RecordCard({
  citationNumber,
  title,
  status,
  recordType,
  occurredAt,
  placeOfViolation,
  fineAmount,
  dueDate,
  href,
  footerLink = "View Receipt",
}: RecordCardProps) {
  const isWarning = recordType === "warning";

  const body = (
    <>
      <div className="flex items-start gap-2.5">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-lg ${
            isWarning ? "bg-warn-soft text-signal-hold" : "bg-danger-soft text-signal-stop"
          }`}
        >
          <ScrollText size={18} strokeWidth={2} aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <p className="tabular truncate text-[14px] leading-tight font-bold text-ink">
            {citationNumber}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted">{title}</p>
        </div>

        <StatusChip status={status} />
      </div>

      <p className="mt-2.5 flex items-center gap-1.5 text-[12px] text-muted">
        <CalendarDays size={13} strokeWidth={2} aria-hidden className="shrink-0" />
        {formatShortDateManila(occurredAt)}
      </p>
      <p className="mt-1 flex items-start gap-1.5 text-[12px] text-muted">
        <MapPin size={13} strokeWidth={2} aria-hidden className="mt-px shrink-0" />
        <span className="line-clamp-2">{placeOfViolation}</span>
      </p>

      {status === "pending" && dueDate ? <DueLine dueDate={dueDate} /> : null}

      <div className="rule-top mt-2.5 flex items-center justify-between gap-3 pt-2.5">
        {isWarning ? (
          <span className="text-[13px] font-bold text-signal-hold">Warning</span>
        ) : (
          <span className="tabular font-display text-[15px] font-bold text-ink">
            {formatPeso(fineAmount ?? 0)}
          </span>
        )}
        <span className="flex shrink-0 items-center gap-0.5 text-[12px] font-semibold text-brand-500">
          {footerLink}
          <ChevronRight size={14} strokeWidth={2.4} aria-hidden />
        </span>
      </div>
    </>
  );

  const shell =
    "block rounded-xl border border-hairline bg-surface p-3.5 transition-colors duration-150";

  if (!href) {
    return <article className={`${shell} mb-3`}>{body}</article>;
  }

  return (
    <Link href={href} className={`${shell} mb-3 active:bg-surface-sunken`}>
      {body}
    </Link>
  );
}