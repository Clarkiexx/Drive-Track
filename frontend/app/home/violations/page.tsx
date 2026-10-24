"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCw } from "lucide-react";

import AppBar from "@/components/common/AppBar";
import ChipRow, { type ChipOption } from "@/components/common/ChipRow";
import EmptyState from "@/components/common/EmptyState";
import FilterBar from "@/components/common/FilterBar";
import NoticeBox from "@/components/common/NoticeBox";
import PageBody from "@/components/common/PageBody";
import RecordCard from "@/components/common/RecordCard";
import type { RecordType } from "@/constants/violations";
import { getApiErrorMessage } from "@/lib/axios";
import { citationService, type CitationRecord } from "@/services/citation.service";

/* Same two filter rows, and the same client-side predicates, as
   driver-app/src/screens/MyViolationsScreen.js. */

const TYPE_FILTERS: ChipOption[] = [
  { value: "All", label: "All" },
  { value: "Citations", label: "Citations" },
  { value: "Warnings", label: "Warnings" },
];

const STATUS_FILTERS: ChipOption[] = [
  { value: "All", label: "All" },
  { value: "Settled", label: "Settled" },
  { value: "Unsettled", label: "Unsettled" },
  { value: "Cancelled", label: "Cancelled" },
];

/** How many card-shaped skeletons stand in for the list while it loads. */
const SKELETON_ROWS = 4;

/**
 * The Prisma enum carries a third member, "violation", that
 * citationController never writes (see constants/violations.ts). RecordCard
 * draws a warning badge for "warning" and a fine for everything else, which is
 * exactly the RN card's two-way branch — so collapsing the unused member onto
 * "citation" reproduces the original behaviour without widening the component.
 */
function cardRecordType(recordType: RecordType): "citation" | "warning" {
  return recordType === "warning" ? "warning" : "citation";
}

export default function MyViolationsPage() {
  const [attempt, setAttempt] = useState(0);
  const [violations, setViolations] = useState<CitationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const rows = await citationService.listMyViolations();
        if (!cancelled) setViolations(rows);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(getApiErrorMessage(error, "Unable to load your violations."));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    // Deferred rather than run in the effect body: the token only exists in the
    // browser, and this keeps the first render identical on both sides.
    const timer = window.setTimeout(load, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [attempt]);

  /**
   * The App Router has no useFocusEffect, so returning to this screen from the
   * receipt does not remount it. The case that actually mattered in the RN app
   * was the driver coming back from a hosted checkout — which is the browser tab
   * regaining focus — so a focus/visibility listener plus the Refresh control
   * above cover it.
   */
  useEffect(() => {
    const refetch = () => setAttempt((n) => n + 1);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refetch();
    };

    window.addEventListener("focus", refetch);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", refetch);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const filtered = useMemo(
    () =>
      violations.filter((violation) => {
        if (typeFilter === "Citations" && violation.recordType !== "citation") return false;
        if (typeFilter === "Warnings" && violation.recordType !== "warning") return false;
        if (statusFilter === "Settled" && violation.settlementStatus !== "settled") return false;
        if (statusFilter === "Unsettled" && violation.settlementStatus !== "pending") return false;
        // warning_only records are deliberately not "Cancelled", exactly as in
        // the RN predicate.
        if (statusFilter === "Cancelled" && violation.settlementStatus !== "cancelled") {
          return false;
        }
        return true;
      }),
    [violations, typeFilter, statusFilter]
  );

  return (
    <>
      <AppBar
        title="My Violations"
        backHref="/home"
        actions={
          <button
            type="button"
            onClick={reload}
            disabled={isLoading}
            aria-label="Refresh violations"
            className="grid size-9 place-items-center rounded-full text-white transition-colors hover:bg-white/15 disabled:opacity-60"
          >
            <RotateCw
              size={18}
              strokeWidth={2.2}
              aria-hidden
              className={isLoading ? "animate-spin" : undefined}
            />
          </button>
        }
      />

      <FilterBar>
        <ChipRow
          options={TYPE_FILTERS}
          value={typeFilter}
          onChange={setTypeFilter}
          label="Filter by record type"
        />
        <ChipRow
          options={STATUS_FILTERS}
          value={statusFilter}
          onChange={setStatusFilter}
          label="Filter by settlement status"
        />
      </FilterBar>

      <PageBody>
        {isLoading ? (
          <SkeletonList />
        ) : errorMessage ? (
          <div className="mt-4 space-y-3">
            <NoticeBox tone="danger" className="text-[13px]">
              {errorMessage}
            </NoticeBox>
            <button
              type="button"
              onClick={reload}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-hairline bg-surface py-3 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-sunken"
            >
              <RotateCw size={16} strokeWidth={2.2} aria-hidden />
              Retry
            </button>
          </div>
        ) : (
          <>
            <p className="mb-2.5 text-[12px] text-muted">{filtered.length} Violation(s)</p>

            {filtered.length === 0 ? (
              <EmptyState title="No violations match this filter." />
            ) : (
              <ul>
                {filtered.map((violation) => (
                  <li key={violation.citationId}>
                    <RecordCard
                      href={`/home/violations/${violation.citationId}`}
                      citationNumber={violation.citationNumber}
                      title={
                        violation.violations?.[0]?.violationType?.description ||
                        violation.otherViolation ||
                        "Violation"
                      }
                      status={violation.settlementStatus}
                      recordType={cardRecordType(violation.recordType)}
                      occurredAt={violation.occurredAt}
                      placeOfViolation={violation.placeOfViolation}
                      fineAmount={violation.fineAmount}
                      dueDate={violation.dueDate}
                      paidAmount={violation.paidAmount}
                      remainingAmount={violation.remainingAmount}
                      partiallyPaid={violation.partiallyPaid}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}

/** Card-shaped placeholders, one per row the list is about to render. */
function SkeletonList() {
  return (
    <ul aria-hidden className="mt-3.5">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <li
          key={index}
          className="mb-3 rounded-xl border border-hairline bg-surface p-3.5"
          style={index > 0 ? { animationDelay: `${index * 110}ms` } : undefined}
        >
          <div className="flex items-start gap-2.5">
            <div className="breathe size-9 shrink-0 rounded-lg bg-surface-sunken" />
            <div className="min-w-0 flex-1">
              <div className="breathe h-3.5 w-32 rounded-full bg-surface-sunken" />
              <div
                className="breathe mt-2 h-3 w-44 rounded-full bg-surface-sunken"
                style={index > 0 ? { animationDelay: `${index * 110 + 90}ms` } : undefined}
              />
            </div>
          </div>
          <div className="breathe mt-3.5 h-3 w-40 rounded-full bg-surface-sunken" />
          <div className="rule-top mt-3 flex items-center justify-between pt-3">
            <div className="breathe h-4 w-20 rounded-full bg-surface-sunken" />
            <div className="breathe h-3 w-24 rounded-full bg-surface-sunken" />
          </div>
        </li>
      ))}
    </ul>
  );
}