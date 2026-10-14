"use client";

import { useCallback, useMemo, useState } from "react";
import { RotateCw } from "lucide-react";

import AppBar from "@/components/common/AppBar";
import BottomNav from "@/components/common/BottomNav";
import ChipRow, { type ChipOption } from "@/components/common/ChipRow";
import EmptyState from "@/components/common/EmptyState";
import FilterBar from "@/components/common/FilterBar";
import NoticeBox from "@/components/common/NoticeBox";
import PageBody from "@/components/common/PageBody";
import RecordCard from "@/components/common/RecordCard";
import useFocusRefresh from "@/components/common/useFocusRefresh";
import type { RecordType } from "@/constants/violations";
import { getApiErrorMessage } from "@/lib/axios";
import { citationService, type CitationRecord } from "@/services/citation.service";

/**
 * Previous Citations — the web port of
 * enforcer-app/src/screens/PreviousCitationsScreen.js: the same two chip rows
 * (type, then date), the same client-side predicates, the same cards.
 *
 * The row tap target. RN pushed PreviousCitations rows to `CitationSuccess`,
 * the receipt shown right after issuing a citation. On the web that screen is
 * /enforcer/citations/[id] — which had to be built before this list could link
 * anywhere, because the only other receipt, /home/violations/[id], sits under
 * `RoleGate allow="driver"` and bounces an officer straight back here. Each card
 * is therefore a link again, and the driver's name in the footer slot sits
 * beside its chevron exactly as it does on /home/violations.
 */

/** Same two rows, same order, same labels as the RN filter strip. */
const TYPE_FILTERS: ChipOption[] = [
  { value: "All", label: "All" },
  { value: "Citations", label: "Citations" },
  { value: "Warnings", label: "Warnings" },
];

const DATE_FILTERS: ChipOption[] = [
  { value: "All", label: "All" },
  { value: "Today", label: "Today" },
  { value: "This Week", label: "This Week" },
  { value: "This Month", label: "This Month" },
];

/** How many card-shaped skeletons stand in for the list while it loads. */
const SKELETON_ROWS = 4;

/**
 * Date-bucket predicates from PreviousCitationsScreen.js.
 *
 * NOTE / duplication carried forward: these are byte-identical to the copies in
 * app/enforcer/page.tsx (and, in the source, to the copies in both RN screens).
 * They are repeated rather than imported because an App Router `page.tsx` may
 * only export the page and its route config — a shared module would have to live
 * outside this lane's write scope. The right home is one
 * `components/common/citationDates.ts` next to the existing `dates.ts`.
 */
function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/** Sunday-anchored: "this week" starts on the current day minus getDay(). */
function isSameWeek(date: Date, now: Date): boolean {
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  return date >= start;
}

function isSameMonth(date: Date, now: Date): boolean {
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

/**
 * The Prisma enum carries a third member, "violation", that
 * citationController never writes. RecordCard draws a warning badge for
 * "warning" and a fine for everything else, which is exactly the RN card's
 * two-way branch — the same collapse app/home/violations/page.tsx makes.
 */
function cardRecordType(recordType: RecordType): "citation" | "warning" {
  return recordType === "warning" ? "warning" : "citation";
}

/** RN's summary line, including the "+N more" overflow. */
function violationSummary(citation: CitationRecord): string {
  const entries = citation.violations ?? [];
  const first = entries[0]?.violationType?.description || "No violation listed";
  return entries.length > 1 ? `${first} +${entries.length - 1} more` : first;
}

export default function PreviousCitationsPage() {
  const [citations, setCitations] = useState<CitationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("All");

  const load = useCallback(async () => {
    setIsLoading(true);

    try {
      setCitations(await citationService.listMyCitations());
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Unable to load citations."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * RN loaded this screen on mount only. It is a list the officer's own wizard
   * appends to, so it also picks up useFocusRefresh — the shared stand-in for
   * useFocusEffect (window focus + tab visibility) — rather than hand-rolled
   * listeners here.
   */
  useFocusRefresh(load);

  const filtered = useMemo(() => {
    const now = new Date();

    return citations.filter((citation) => {
      if (typeFilter === "Citations" && citation.recordType !== "citation") return false;
      if (typeFilter === "Warnings" && citation.recordType !== "warning") return false;

      if (dateFilter === "All") return true;

      const occurred = new Date(citation.occurredAt);
      if (dateFilter === "Today") return isSameDay(occurred, now);
      if (dateFilter === "This Week") return isSameWeek(occurred, now);
      if (dateFilter === "This Month") return isSameMonth(occurred, now);
      return true;
    });
  }, [citations, typeFilter, dateFilter]);

  return (
    <>
      <AppBar
        title="Previous Citations"
        backHref="/enforcer"
        actions={
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            aria-label="Refresh previous citations"
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
          options={DATE_FILTERS}
          value={dateFilter}
          onChange={setDateFilter}
          label="Filter by date issued"
        />
      </FilterBar>

      <PageBody>
        {isLoading && citations.length === 0 ? (
          <SkeletonList />
        ) : errorMessage && citations.length === 0 ? (
          <div className="mt-4 space-y-3">
            <NoticeBox tone="danger" className="text-[13px]">
              {errorMessage}
            </NoticeBox>
            <button
              type="button"
              onClick={() => void load()}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-hairline bg-surface py-3 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-sunken"
            >
              <RotateCw size={16} strokeWidth={2.2} aria-hidden />
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* A failed refresh leaves the rows already on screen and reports
                itself above them; the officer never loses what they were
                reading mid-patrol. */}
            {errorMessage ? (
              <NoticeBox tone="danger" className="mt-4 text-[13px]">
                {errorMessage}
              </NoticeBox>
            ) : null}

            <p className="mt-4 mb-2.5 text-[12px] text-muted">{filtered.length} Citation(s)</p>

            {filtered.length === 0 ? (
              <EmptyState title="No citations found for this filter." />
            ) : (
              <ul>
                {filtered.map((citation) => (
                  <li key={citation.citationId}>
                    <RecordCard
                      href={`/enforcer/citations/${citation.citationId}`}
                      citationNumber={citation.citationNumber}
                      title={violationSummary(citation)}
                      status={citation.settlementStatus}
                      recordType={cardRecordType(citation.recordType)}
                      occurredAt={citation.occurredAt}
                      placeOfViolation={citation.placeOfViolation}
                      fineAmount={citation.fineAmount}
                      dueDate={citation.dueDate}
                      footerLink={
                        citation.driver
                          ? `${citation.driver.firstName} ${citation.driver.lastName}`.trim()
                          : "—"
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </PageBody>

      <BottomNav />
    </>
  );
}

/** Card-shaped placeholders, one per row the list is about to render. */
function SkeletonList() {
  return (
    <ul aria-hidden className="mt-6">
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