"use client";

import { Check } from "lucide-react";

import { paymentMethodLabel } from "@/constants/violations";
import type {
  CitationRecord,
  CitationViolationEntry,
} from "@/services/citation.service";
import { formatPeso } from "./dates";

/**
 * Driver-facing payable violations list — the receip's pale-red panel with a
 * checkbox per unpaid violation so a partial payment can charge a subset.
 *
 * The enforcer receipt keeps the original `ViolationsBox`; this component is
 * additive and only the driver detail page renders it.
 */

export type PayableViolationRow = {
  /** Stable React key. */
  key: string;
  /** Primary key of the citation-violation join row; null when unavailable. */
  violationId: number | null;
  /** "Description (Article 12)" */
  label: string;
  /** Fine for this row, in pesos. Zero means "no fine recorded". */
  amount: number;
  /** True once this row's fine has been paid. */
  paid: boolean;
  /** "GCash • REF-12" — method/reference of the payment that settled the row. */
  paidLine: string;
};

function rowAmount(entry: CitationViolationEntry): number {
  const value = Number(entry.penaltyAtIssuance);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Builds the payable rows from the citation's violations. Legacy
 * whole-citation settlements carry no per-row state: when the receipt itself
 * is settled, unmarked rows are treated as paid and shown with the citation's
 * payment reference.
 */
export function buildPayableViolationRows(
  citation: CitationRecord
): PayableViolationRow[] {
  const citationSettled = citation.settlementStatus === "settled";

  return (citation.violations ?? []).map((entry, index) => {
    const description = entry.violationType?.description?.trim() || "Unspecified violation";
    const article = entry.violationType?.articleSection?.trim() || "";
    const label = article ? `${description} (${article})` : description;

    const rowSettled = entry.settlementStatus === "settled";
    const legacySettled = citationSettled && entry.settlementStatus == null;
    const paid = rowSettled || legacySettled;

    const method = entry.paymentMethod ?? (legacySettled ? citation.paymentMethod : null);
    const reference =
      entry.paymentReference ?? (legacySettled ? citation.paymentReference : null);
    const paidLine = [
      method ? paymentMethodLabel(method) : null,
      reference ? String(reference) : null,
    ]
      .filter(Boolean)
      .join(" • ");

    return {
      key: `violation-${entry.id ?? `${index}-${description}`}`,
      violationId: typeof entry.id === "number" ? entry.id : null,
      label,
      amount: rowAmount(entry),
      paid,
      paidLine,
    };
  });
}

/** Rows that can still go into a payment (paid rows and id-less rows excluded). */
export function payableRowIds(rows: PayableViolationRow[]): number[] {
  return rows
    .filter((row) => !row.paid && row.violationId != null)
    .map((row) => row.violationId as number);
}

type PayableViolationsBoxProps = {
  rows: PayableViolationRow[];
  /** Free-text violation; shown as a non-selectable line, it carries no fine. */
  otherViolation?: string;
  /** Checkboxes are offered only while the citation can still be paid. */
  selectable?: boolean;
  /** True while an open checkout session pins the selection. */
  locked?: boolean;
  selectedIds?: number[];
  onToggle?: (violationId: number) => void;
  onSelectAll?: () => void;
  onClear?: () => void;
  className?: string;
};

export default function PayableViolationsBox({
  rows,
  otherViolation,
  selectable = false,
  locked = false,
  selectedIds = [],
  onToggle,
  onSelectAll,
  onClear,
  className = "",
}: PayableViolationsBoxProps) {
  const selected = new Set(selectedIds);
  const unpaidCount = rows.filter(
    (row) => !row.paid && row.violationId != null
  ).length;
  const showControls =
    Boolean(selectable && unpaidCount > 1 && onSelectAll && onClear) && !locked;

  return (
    <div className={`mb-3.5 rounded-[10px] bg-danger-soft p-3.5 ${className}`}>
      <div className="flex min-h-8 items-center justify-between gap-2">
        <p className="text-[12px] font-bold text-signal-stop">Violations</p>
        {showControls ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onSelectAll}
              className="rounded px-2.5 py-2 text-[11px] font-semibold text-brand-700 underline-offset-2 transition-colors hover:underline"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded px-2.5 py-2 text-[11px] font-semibold text-brand-700 underline-offset-2 transition-colors hover:underline"
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>

      {locked ? (
        <p className="mb-1.5 text-[11px] leading-snug text-muted">
          Selection is locked to your open payment session. Cancel it to pick
          other violations.
        </p>
      ) : null}

      <ul
        role={selectable ? "group" : undefined}
        aria-label={selectable ? "Violations to pay" : undefined}
        className="space-y-0.5"
      >
        {rows.map((row) => {
          const canSelect =
            selectable && !locked && row.violationId != null && Boolean(onToggle);

          // Unpaid, individually addressable: a checkbox row.
          if (canSelect && !row.paid) {
            const checked = selected.has(row.violationId as number);
            return (
              <li key={row.key}>
                <label className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1.5">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={checked}
                    disabled={locked}
                    onChange={() => onToggle?.(row.violationId as number)}
                  />
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border border-signal-stop/40 bg-surface text-white transition-colors peer-checked:border-signal-stop peer-checked:bg-signal-stop peer-disabled:cursor-not-allowed peer-disabled:opacity-60 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-brand-500"
                  >
                    <Check
                      size={13}
                      strokeWidth={3}
                      className={checked ? "opacity-100" : "opacity-0"}
                    />
                  </span>
                  <span className="flex-1 text-[13px] leading-snug text-signal-stop">
                    {row.label}
                  </span>
                  <span className="tabular shrink-0 py-0.5 text-[13px] font-semibold text-signal-stop">
                    {row.amount > 0 ? formatPeso(row.amount) : "No fine"}
                  </span>
                </label>
              </li>
            );
          }

          // Paid: a settled row with its method/reference, never selectable.
          if (row.paid) {
            return (
              <li
                key={row.key}
                className="flex min-h-9 items-start gap-2.5 py-1.5"
              >
                <span
                  aria-hidden
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-signal-go text-white"
                >
                  <Check size={13} strokeWidth={3} />
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="text-[13px] leading-snug text-signal-stop">
                    {row.label}
                  </span>
                  {row.paidLine ? (
                    <span className="mt-0.5 text-[11px] leading-snug text-muted">
                      Paid via {row.paidLine}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 py-0.5">
                  {row.amount > 0 ? (
                    <span className="tabular text-[13px] font-semibold text-muted">
                      {formatPeso(row.amount)}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-go-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-go-ink">
                    Paid
                  </span>
                </span>
              </li>
            );
          }

          // Unpaid but not selectable (settled/cancelled citation without
          // per-row state, warnings, or a join row without an id).
          return (
            <li key={row.key} className="flex min-h-9 items-start gap-2 py-1.5">
              <span
                aria-hidden
                className="mt-2 size-1 shrink-0 rounded-full bg-signal-stop/60"
              />
              <span className="flex-1 text-[13px] leading-snug text-signal-stop">
                {row.label}
              </span>
              {row.amount > 0 ? (
                <span className="tabular shrink-0 py-0.5 text-[13px] font-semibold text-signal-stop">
                  {formatPeso(row.amount)}
                </span>
              ) : null}
            </li>
          );
        })}

        {/* Officers may type a free-text violation that has no fine attached. */}
        {otherViolation ? (
          <li className="flex min-h-9 items-start gap-2 py-1.5">
            <span
              aria-hidden
              className="mt-2 size-1 shrink-0 rounded-full bg-signal-stop/60"
            />
            <span className="flex-1 text-[13px] italic leading-snug text-signal-stop">
              {otherViolation}
            </span>
            <span className="shrink-0 py-0.5 text-[11px] font-semibold text-muted">
              No fine
            </span>
          </li>
        ) : null}

        {rows.length === 0 && !otherViolation ? (
          <li className="py-1">
            <p className="text-[13px] text-signal-stop">
              No violation details recorded.
            </p>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
