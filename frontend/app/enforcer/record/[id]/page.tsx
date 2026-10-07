"use client";

import { use, useCallback, useEffect, useState } from "react";
import { CalendarDays, CreditCard, MapPin, RotateCw, TriangleAlert } from "lucide-react";

import AppBar from "@/components/common/AppBar";
import BottomNav from "@/components/common/BottomNav";
import EmptyState from "@/components/common/EmptyState";
import NoticeBox from "@/components/common/NoticeBox";
import PageBody from "@/components/common/PageBody";
import StatusChip from "@/components/common/StatusChip";
import { formatPeso, formatShortDate, formatTime } from "@/components/common/dates";
import { getApiErrorMessage } from "@/lib/axios";
import type { CitationRecord } from "@/services/citation.service";
import { driverService, type DriverRecord } from "@/services/driver.service";
import type { RecordType } from "@/constants/violations";

type DriverRecordPageProps = {
  /** Next 16: dynamic params arrive as a promise, unwrapped with React.use(). */
  params: Promise<{ id: string }>;
};

/**
 * Driver Record — the web port of
 * enforcer-app/src/screens/DriverRecordScreen.js: profile card, then the
 * violation history under a count badge.
 *
 * FIXES A REAL RN BUG WHILE PORTING IT. The original reads
 *     const { driverId, driver } = route.params;
 *     const driverInfo = driver || citations[0]?.Driver;
 * but its only call site — handleSelectDriver in DriverSearchScreen — passes
 * `{ driverId }` and never `driver`. So `driverInfo` was always
 * `citations[0]?.Driver`, which means a driver with ZERO prior violations
 * rendered no profile card at all: the officer arrived on the record of someone
 * they had just stopped for the first time and the screen opened on an empty
 * "No prior violations on record." with nothing identifying who they were
 * looking at. The profile now comes from driverService.getDriver(id) in its own
 * request, so the card is there regardless of the citation history.
 *
 * CONTRACT NOTE: Prisma returns the relation under its LOWERCASE key, so the
 * driver name comes from `citation.driver` — not the Sequelize-era `Driver`
 * key the old Expo app read, which no longer exists on any response.
 */
export default function DriverRecordPage({ params }: DriverRecordPageProps) {
  const { id } = use(params);

  const [driver, setDriver] = useState<DriverRecord | null>(null);
  const [citations, setCitations] = useState<CitationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);

    // Both requests are needed and independent: the profile card comes from one,
    // the history from the other. `allSettled` keeps a failure of either from
    // discarding the other's result.
    const [driverResult, citationsResult] = await Promise.allSettled([
      driverService.getDriver(id),
      driverService.getDriverCitations(id),
    ]);

    if (driverResult.status === "fulfilled") {
      setDriver(driverResult.value);
      setErrorMessage("");
    } else {
      setErrorMessage(getApiErrorMessage(driverResult.reason, "Unable to load this driver."));
    }

    if (citationsResult.status === "fulfilled") {
      setCitations(citationsResult.value);
    }

    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    // Deferred rather than run in the effect body: the token only exists in the
    // browser, and this keeps the first render identical on both sides.
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <>
      <AppBar
        title="Driver Record"
        backHref="/enforcer/search"
        actions={
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            aria-label="Refresh driver record"
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

      <PageBody>
        {/* RN's profileCard: a grey avatar disc, "Last, First", the licence
            number, and the address when the record has one. */}
        {driver ? <ProfileCard driver={driver} /> : null}

        <div className="mt-7 mb-3 flex items-center gap-2">
          <h2 className="font-display text-[16px] font-semibold tracking-tight text-ink">
            Violation History
          </h2>
          <span className="tabular rounded-full bg-surface-sunken px-2.5 py-[2px] text-[12px] font-bold text-ink">
            {citations.length}
          </span>
        </div>

        {isLoading && !driver && citations.length === 0 ? (
          <SkeletonHistory />
        ) : errorMessage && !driver ? (
          <div className="space-y-3">
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
        ) : citations.length === 0 ? (
          <div className="space-y-3">
            {errorMessage ? (
              <NoticeBox tone="danger" className="text-[13px]">
                {errorMessage}
              </NoticeBox>
            ) : null}
            <EmptyState title="No prior violations on record." />
          </div>
        ) : (
          <ul>
            {errorMessage ? (
              <li className="mb-3">
                <NoticeBox tone="danger" className="text-[13px]">
                  {errorMessage}
                </NoticeBox>
              </li>
            ) : null}

            {citations.map((citation, index) => (
              <li
                key={citation.citationId}
                className="rise-sm"
                style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
              >
                <HistoryRow citation={citation} />
              </li>
            ))}
          </ul>
        )}
      </PageBody>

      <BottomNav />
    </>
  );
}

type ProfileCardProps = {
  driver: DriverRecord;
};

/** The profile card from DriverRecordScreen, fetched from GET /drivers/:id. */
function ProfileCard({ driver }: ProfileCardProps) {
  return (
    <section className="rise mt-5 rounded-[14px] border border-hairline bg-surface p-5 shadow-card">
      <span
        aria-hidden
        className="mb-3 block size-11 rounded-full bg-surface-sunken ring-1 ring-hairline ring-inset"
      />

      <h2 className="font-display text-[17px] font-semibold tracking-tight text-ink">
        {driver.lastName}, {driver.firstName}
      </h2>

      <p className="tabular mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-signal-info">
        <CreditCard size={14} strokeWidth={2.2} aria-hidden className="shrink-0" />
        {driver.licenseNumber}
      </p>

      {driver.address ? (
        <p className="mt-1 flex items-start gap-1.5 text-[13px] leading-snug text-muted">
          <MapPin size={14} strokeWidth={2.2} aria-hidden className="mt-px shrink-0" />
          {driver.address}
        </p>
      ) : null}
    </section>
  );
}

type HistoryRowProps = {
  citation: CitationRecord;
};

/**
 * One violation-history card from DriverRecordScreen: warning icon, description,
 * citation number, date + time, location, and — for anything that is not a
 * warning — the fine beside its settlement chip. The record-type badge sits
 * top-right.
 */
function HistoryRow({ citation }: HistoryRowProps) {
  const isWarning = citation.recordType === "warning";

  return (
    <article className="mb-2.5 flex items-start gap-2.5 rounded-xl border border-hairline bg-surface p-3.5">
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-lg ${
          isWarning ? "bg-warn-soft text-signal-hold" : "bg-danger-soft text-signal-stop"
        }`}
      >
        <TriangleAlert size={18} strokeWidth={2.2} aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[14px] leading-snug font-bold text-ink">
          {citation.violations?.[0]?.violationType?.description ||
            citation.otherViolation ||
            "Violation"}
        </p>

        <p className="tabular mt-0.5 text-[11px] text-muted">ID: {citation.citationNumber}</p>

        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
          <CalendarDays size={12} strokeWidth={2.2} aria-hidden className="shrink-0" />
          {formatShortDate(citation.occurredAt)} • {formatTime(citation.occurredAt)}
        </p>

        <p className="mt-0.5 flex items-start gap-1.5 text-[12px] leading-snug text-muted">
          <MapPin size={12} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0" />
          {citation.placeOfViolation}
        </p>

        {/* RN skipped the whole fine row for warnings — they carry no fine. */}
        {isWarning ? null : (
          <div className="mt-2 flex items-center gap-2">
            <span className="tabular font-display text-[13px] font-bold text-ink">
              {formatPeso(citation.fineAmount ?? 0)}
            </span>
            <StatusChip status={citation.settlementStatus} />
          </div>
        )}
      </div>

      <RecordTypeBadge recordType={citation.recordType} />
    </article>
  );
}

/**
 * RecordTypeBadge from DriverRecordScreen: citation and violation share the red
 * "Citation"/"Violation" treatment, warning gets the amber one, and anything
 * unrecognised falls back to citation — the same `map[recordType] || map.citation`
 * the RN file used.
 */
const RECORD_BADGE: Record<RecordType, { label: string; className: string }> = {
  citation: { label: "Citation", className: "bg-danger-soft text-signal-stop" },
  warning: { label: "Warning", className: "bg-warn-soft text-signal-hold" },
  violation: { label: "Violation", className: "bg-danger-soft text-signal-stop" },
};

function RecordTypeBadge({ recordType }: { recordType: RecordType }) {
  const badge = RECORD_BADGE[recordType] ?? RECORD_BADGE.citation;

  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-[3px] text-[11px] font-bold ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

/** Placeholder history rows, matching the HistoryRow silhouette. */
function SkeletonHistory() {
  return (
    <ul aria-hidden>
      {[0, 1, 2].map((index) => (
        <li
          key={index}
          className="mb-2.5 flex items-start gap-2.5 rounded-xl border border-hairline bg-surface p-3.5"
          style={index > 0 ? { animationDelay: `${index * 110}ms` } : undefined}
        >
          <div className="breathe size-9 shrink-0 rounded-lg bg-surface-sunken" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="breathe h-3.5 w-52 rounded-full bg-surface-sunken" />
            <div
              className="breathe h-2.5 w-28 rounded-full bg-surface-sunken"
              style={index > 0 ? { animationDelay: `${index * 110 + 80}ms` } : undefined}
            />
            <div className="breathe h-2.5 w-40 rounded-full bg-surface-sunken" />
          </div>
        </li>
      ))}
    </ul>
  );
}