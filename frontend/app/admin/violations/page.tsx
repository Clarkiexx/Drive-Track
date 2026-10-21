"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Flag,
  RotateCw,
  ScrollText,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import EmptyState from "@/components/common/EmptyState";
import CitationMap from "@/components/common/CitationMap";
import FormField from "@/components/common/FormField";
import NoticeBox from "@/components/common/NoticeBox";
import StatusChip from "@/components/common/StatusChip";
import {
  formatPeso,
  formatShortDateManila,
  formatTimeManila,
} from "@/components/common/dates";
import { RECORD_TYPE_LABELS, isRecordType } from "@/constants/violations";
import { getApiErrorMessage } from "@/lib/axios";
import { getMediaUrl } from "@/lib/media";
import {
  citationService,
  type CitationRecord,
} from "@/services/citation.service";

/** Every console table pages eight rows at a time. */
const PAGE_LIMIT = 8;

type TabKey = "all" | "pending" | "settled" | "protest" | "cancelled" | "warning";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "pending", label: "Unsettled" },
  { key: "settled", label: "Settled" },
  { key: "protest", label: "Under Protest" },
  { key: "cancelled", label: "Cancelled" },
  { key: "warning", label: "Warnings" },
];

/**
 * Maps a sidebar tab onto backend query params
 * (backend/src/controllers/citationController.js:listAllCitations —
 * `status`, `recordType`, `underProtest`, `search`).
 */
function paramsForTab(tab: TabKey): {
  status?: string;
  underProtest?: boolean;
} {
  if (tab === "pending") return { status: "pending" };
  if (tab === "settled") return { status: "settled" };
  if (tab === "protest") return { underProtest: true };
  if (tab === "cancelled") return { status: "cancelled" };
  if (tab === "warning") return { status: "warning_only" };
  return {};
}

function violationSummary(citation: CitationRecord): string {
  const lines = (citation.violations || [])
    .map((v) => v.violationType?.description)
    .filter(Boolean) as string[];
  if (lines.length === 0) return citation.otherViolation || "—";
  if (lines.length === 1) return lines[0];
  return `${lines[0]} +${lines.length - 1} more`;
}

function toNumber(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function AdminViolationsPage() {
  const [citations, setCitations] = useState<CitationRecord[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedCitationId, setSelectedCitationId] = useState<number | null>(null);

  const load = useCallback(
    async (page: number, searchValue: string, tabValue: TabKey) => {
      setIsLoading(true);
      setLoadError("");
      try {
        const { status, underProtest } = paramsForTab(tabValue);
        const result = await citationService.listCitationsPage({
          page,
          limit: PAGE_LIMIT,
          ...(searchValue.trim() ? { search: searchValue.trim() } : {}),
          ...(status ? { status: status as never } : {}),
          ...(underProtest ? { underProtest } : {}),
        });
        setCitations(result.citations);
        setPagination(result.pagination);
      } catch (err) {
        setCitations([]);
        setLoadError(getApiErrorMessage(err, "Unable to load citations."));
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(1, search, tab), 0);
    return () => window.clearTimeout(timer);
  }, [load, search, tab]);

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSearch(searchInput);
  };

  const handleTabChange = (next: TabKey) => {
    setTab(next);
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold tracking-[0.18em] text-brand-600 uppercase">
            Violations
          </p>
          <h2 className="font-display mt-1.5 text-[22px] leading-tight font-semibold tracking-tight text-ink">
            Violation register
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-console-muted">
            Every citation and warning enforcers issue lands here. Open a row to
            verify it, adjust the fine, settle or cancel it, send a reminder, or
            resolve a protest — drivers see the result in their app.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load(pagination.page, search, tab)}
          disabled={isLoading}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink shadow-console transition-colors hover:border-brand-300 hover:bg-brand-soft disabled:opacity-60"
        >
          <RotateCw
            size={14}
            strokeWidth={2.3}
            className={isLoading ? "animate-spin" : undefined}
            aria-hidden
          />
          {isLoading ? "Refreshing" : "Refresh"}
        </button>
      </div>

      <form
        onSubmit={handleSearchSubmit}
        className="rise flex gap-2"
        role="search"
        aria-label="Search citations"
      >
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-console-muted"
          />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search citation number…"
            aria-label="Search citation number"
            className="dt-input pr-3 pl-10"
          />
        </div>
        <button
          type="submit"
          className="shrink-0 rounded-[10px] bg-console-rail px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-console-rail-deep disabled:opacity-60"
          disabled={isLoading}
        >
          Search
        </button>
      </form>

      <div
        className="rise mt-3 flex flex-wrap gap-2"
        style={{ animationDelay: "60ms" }}
        role="tablist"
        aria-label="Filter citations by status"
      >
        {TABS.map((entry) => {
          const isActive = tab === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabChange(entry.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                isActive
                  ? "border-console-rail bg-console-rail text-white"
                  : "border-console-line bg-surface text-ink hover:border-brand-300 hover:bg-brand-soft"
              }`}
            >
              {entry.key === "protest" ? (
                <Flag size={12} strokeWidth={2.6} aria-hidden />
              ) : null}
              {entry.label}
            </button>
          );
        })}
      </div>

      <section
        className="rise mt-4 overflow-hidden rounded-2xl border border-console-line bg-surface shadow-console"
        style={{ animationDelay: "120ms" }}
        aria-live="polite"
      >
        <header className="flex items-center gap-2.5 border-b border-console-line px-5 py-3.5">
          <ScrollText size={16} strokeWidth={2.1} className="shrink-0 text-brand-600" aria-hidden />
          <h3 className="font-display text-[15px] leading-none font-semibold tracking-tight text-ink">
            Citations
          </h3>
          <p className="ml-auto shrink-0 text-[11.5px] leading-none text-console-muted">
            {pagination.total} on record
          </p>
        </header>

        {isLoading ? (
          <ul aria-hidden className="divide-y divide-console-line/70">
            {[0, 1, 2, 3].map((index) => (
              <li key={index} className="flex items-center gap-3 px-5 py-4">
                <div className="breathe h-3 w-28 rounded-full bg-console-canvas" />
                <div className="breathe h-3 w-40 rounded-full bg-console-canvas [animation-delay:120ms]" />
                <div className="breathe ml-auto h-5 w-20 rounded-full bg-console-canvas [animation-delay:200ms]" />
              </li>
            ))}
          </ul>
        ) : loadError ? (
          <div className="p-5">
            <NoticeBox tone="danger" className="text-[13px]">
              {loadError}
            </NoticeBox>
          </div>
        ) : citations.length === 0 ? (
          <EmptyState title="No citations found">
            Nothing matches this filter. Enforcers issue citations from the field
            app, so new records appear here the same day.
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse text-left">
                <caption className="sr-only">
                  Citations matching the current filter, newest first
                </caption>
                <thead>
                  <tr className="border-b border-console-line bg-console-canvas/70 text-[10.5px] tracking-[0.14em] text-console-muted uppercase">
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Citation
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Driver
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Enforcer
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Issued
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-right font-bold">
                      Fine
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {citations.map((citation) => (
                    <tr
                      key={citation.citationId}
                      className="border-b border-console-line/70 transition-colors last:border-0 hover:bg-brand-50/70"
                    >
                      <td className="px-5 py-3.5 align-top">
                        <p className="tabular-nums text-[13px] font-bold text-ink">
                          {citation.citationNumber}
                        </p>
                        <p className="mt-1 max-w-56 truncate text-[11.5px] leading-none text-console-muted">
                          {violationSummary(citation)}
                        </p>
                        <p className="mt-1 text-[11.5px] leading-none text-console-muted">
                          {isRecordType(citation.recordType)
                            ? RECORD_TYPE_LABELS[citation.recordType]
                            : "Record"}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 align-top text-[13px] text-ink/80">
                        {citation.driver
                          ? `${citation.driver.firstName} ${citation.driver.lastName}`
                          : "—"}
                      </td>
                      <td className="px-5 py-3.5 align-top text-[13px] text-ink/80">
                        {citation.enforcer
                          ? `Officer ${citation.enforcer.lastName}`
                          : "—"}
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <p className="text-[13px] leading-tight text-ink/80">
                          {formatShortDateManila(citation.occurredAt)}
                        </p>
                        <p className="tabular-nums mt-1 text-[11.5px] leading-none text-console-muted">
                          {formatTimeManila(citation.occurredAt)}
                        </p>
                      </td>
                      <td className="tabular-nums px-5 py-3.5 text-right align-top text-[13px] font-bold text-ink">
                        {citation.recordType === "warning"
                          ? "—"
                          : formatPeso(toNumber(citation.fineAmount))}
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <div className="flex flex-col items-start gap-1.5">
                          <StatusChip status={citation.settlementStatus} />
                          <span className="inline-flex items-center gap-1.5 text-[11px] leading-none font-semibold text-console-muted">
                            {citation.verified ? (
                              <span className="inline-flex items-center gap-1 text-brand-600">
                                <ShieldCheck size={11} strokeWidth={2.6} aria-hidden />
                                Verified
                              </span>
                            ) : (
                              "Not verified"
                            )}
                          </span>
                          {citation.driverUnderProtest ? (
                            <span className="inline-flex items-center gap-1 text-[11px] leading-none font-bold text-signal-stop">
                              <Flag size={11} strokeWidth={2.6} aria-hidden />
                              Protest
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <button
                          type="button"
                          onClick={() => setSelectedCitationId(citation.citationId)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-console-line bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-console-line px-5 py-3.5">
              <p className="text-[12px] text-console-muted">
                Showing page {pagination.page} of {Math.max(pagination.totalPages, 1)} (
                {pagination.total} results)
              </p>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  disabled={pagination.page <= 1 || isLoading}
                  onClick={() => void load(pagination.page - 1, search, tab)}
                  className="rounded-lg border border-console-line bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages || isLoading}
                  onClick={() => void load(pagination.page + 1, search, tab)}
                  className="rounded-lg border border-console-line bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {selectedCitationId !== null ? (
        <CitationDetailDialog
          citationId={selectedCitationId}
          onClose={() => setSelectedCitationId(null)}
          onChanged={() => void load(pagination.page, search, tab)}
        />
      ) : null}
    </div>
  );
}

function CitationDetailDialog({
  citationId,
  onClose,
  onChanged,
}: {
  citationId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [citation, setCitation] = useState<CitationRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isActing, setIsActing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    action: () => Promise<void>;
  } | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideError, setOverrideError] = useState("");
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const record = await citationService.getCitation(citationId);
      setCitation(record);
    } catch (err) {
      setCitation(null);
      setErrorMessage(getApiErrorMessage(err, "Unable to load citation."));
    } finally {
      setIsLoading(false);
    }
  }, [citationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (enlargedPhoto) setEnlargedPhoto(null);
        else if (!confirm && !showOverride) onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirm, enlargedPhoto, onClose, showOverride]);

  async function runAction(fn: () => Promise<CitationRecord | void>, successMessage: string) {
    if (isActing) return;
    setIsActing(true);
    setActionError("");
    setActionNotice("");
    try {
      const result = await fn();
      if (result && typeof result === "object" && "citationId" in result) {
        setCitation(result as CitationRecord);
      } else {
        await reload();
      }
      onChanged();
      setActionNotice(successMessage);
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Action failed. Please try again."));
    } finally {
      setIsActing(false);
      setConfirm(null);
    }
  }

  const askVerify = () =>
    setConfirm({
      title: `Verify citation ${citation?.citationNumber}?`,
      message:
        "This confirms the citation was reviewed and is valid. You can still settle, cancel, or override it afterward.",
      confirmLabel: "Verify",
      action: () => runAction(() => citationService.verifyCitation(citationId), "Citation verified."),
    });

  const askSettle = () =>
    setConfirm({
      title: "Mark this citation as settled?",
      message:
        "Use this once the fine has actually been paid (e.g. the driver settled it in person at the CTMO office). The driver is notified automatically.",
      confirmLabel: "Mark as Settled",
      action: () => runAction(() => citationService.settleCitation(citationId), "Citation marked as settled."),
    });

  const askRemind = () =>
    setConfirm({
      title: "Send a payment reminder?",
      message: "The driver receives a one-off payment reminder for this citation.",
      confirmLabel: "Send Reminder",
      action: () => runAction(() => citationService.sendReminder(citationId), "Reminder sent."),
    });

  const askCancel = () =>
    setConfirm({
      title: "Cancel this citation?",
      message:
        "Only do this if it was issued in error. Cancelled citations cannot be settled, and the driver is notified.",
      confirmLabel: "Cancel Citation",
      action: () => runAction(() => citationService.cancelCitation(citationId), "Citation cancelled."),
    });

  const askProtest = (action: "dismiss" | "uphold") =>
    setConfirm({
      title: action === "dismiss" ? "Dismiss protest?" : "Uphold protest?",
      message:
        action === "dismiss"
          ? "The citation stands and the protest flag is cleared. The driver is notified."
          : "The citation is cancelled in the driver's favor. The driver is notified.",
      confirmLabel: action === "dismiss" ? "Dismiss Protest" : "Uphold Protest",
      action: () =>
        runAction(
          () => citationService.resolveProtest(citationId, action),
          action === "dismiss" ? "Protest dismissed." : "Protest upheld — citation cancelled."
        ),
    });

  async function handleOverrideSubmit(event: React.FormEvent) {
    event.preventDefault();
    setOverrideError("");
    const amount = Number(overrideAmount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 99999999) {
      setOverrideError("Enter a valid fine amount between 0 and 99,999,999.");
      return;
    }
    if (!overrideReason.trim()) {
      setOverrideError("A reason is required when overriding a fine amount.");
      return;
    }
    if (isActing) return;
    setIsActing(true);
    try {
      const updated = await citationService.overrideFineAmount(citationId, {
        fineAmount: amount,
        reason: overrideReason.trim(),
      });
      setCitation(updated);
      onChanged();
      setShowOverride(false);
      setActionNotice("Fine amount updated.");
    } catch (err) {
      setOverrideError(getApiErrorMessage(err, "Unable to override fine."));
    } finally {
      setIsActing(false);
    }
  }

  const isPending = citation?.settlementStatus === "pending";
  const isPayable = isPending && citation?.recordType === "citation";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-4 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={citation ? `Citation ${citation.citationNumber}` : "Citation details"}
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-console-line bg-surface shadow-float"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-2.5 border-b border-console-line px-5 py-3.5">
          <ScrollText size={16} strokeWidth={2.1} className="shrink-0 text-brand-600" aria-hidden />
          <h3 className="font-display min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-ink">
            {citation ? citation.citationNumber : "Citation details"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close citation details"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-console-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="px-5 py-4">
          {isLoading ? (
            <div className="space-y-2 py-4" aria-hidden>
              <div className="breathe h-3 w-40 rounded-full bg-console-canvas" />
              <div className="breathe h-3 w-64 rounded-full bg-console-canvas [animation-delay:120ms]" />
              <div className="breathe h-24 rounded-xl bg-console-canvas [animation-delay:200ms]" />
            </div>
          ) : errorMessage || !citation ? (
            <NoticeBox tone="danger" className="text-[13px]">
              {errorMessage || "Citation not found."}
            </NoticeBox>
          ) : (
            <>
              {actionError ? (
                <NoticeBox tone="danger" className="mb-3 text-[13px]">
                  {actionError}
                </NoticeBox>
              ) : null}
              {actionNotice ? (
                <NoticeBox tone="success" className="mb-3 text-[13px]">
                  {actionNotice}
                </NoticeBox>
              ) : null}

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <h4 className="text-[12px] font-bold tracking-[0.12em] text-console-muted uppercase">
                    Driver
                  </h4>
                  <p className="mt-1.5 text-[14px] font-semibold text-ink">
                    {citation.driver
                      ? `${citation.driver.firstName} ${citation.driver.lastName}`
                      : "—"}
                  </p>
                  {citation.driver?.licenseNumber ? (
                    <p className="tabular mt-0.5 text-[12.5px] text-console-muted">
                      {citation.driver.licenseNumber}
                    </p>
                  ) : null}

                  <h4 className="mt-4 text-[12px] font-bold tracking-[0.12em] text-console-muted uppercase">
                    Vehicle
                  </h4>
                  <p className="mt-1.5 text-[13px] text-ink/80">
                    Unit: {citation.vehicleUnitType || "—"}
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink/80">
                    Plate: {citation.plateNumber || "—"}
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink/80">
                    Owner: {citation.registeredOwner || "—"}
                  </p>

                  <h4 className="mt-4 text-[12px] font-bold tracking-[0.12em] text-console-muted uppercase">
                    Violation
                  </h4>
                  <ul className="mt-1.5 space-y-1">
                    {(citation.violations || []).map((v) => (
                      <li key={v.id ?? v.violationType?.violationTypeId} className="text-[13px] text-ink/80">
                        • {v.violationType?.description || "Violation"} (
                        {formatPeso(toNumber(v.penaltyAtIssuance))})
                      </li>
                    ))}
                    {(!citation.violations || citation.violations.length === 0) && (
                      <li className="text-[13px] text-ink/80">
                        {citation.otherViolation || "—"}
                      </li>
                    )}
                  </ul>
                  <p className="mt-2 text-[12.5px] text-console-muted">
                    {formatShortDateManila(citation.occurredAt)} • {formatTimeManila(citation.occurredAt)}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-console-muted">
                    📍 {citation.placeOfViolation}
                  </p>
                  <CitationMap
                    latitude={citation.latitude}
                    longitude={citation.longitude}
                    place={citation.placeOfViolation}
                    height={200}
                    className="mt-3"
                  />
                  {citation.driverUnderProtest ? (
                    <p className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-bold text-signal-stop">
                      <Flag size={12} strokeWidth={2.6} aria-hidden />
                      Driver marked this citation as under protest
                    </p>
                  ) : null}
                </div>

                <div>
                  <h4 className="text-[12px] font-bold tracking-[0.12em] text-console-muted uppercase">
                    Evidence
                  </h4>
                  {citation.evidence && citation.evidence.length > 0 ? (
                    <ul className="mt-1.5 flex flex-wrap gap-2">
                      {citation.evidence.map((ev) => {
                        const url = getMediaUrl(ev.imagePath);
                        if (!url) return null;
                        return (
                          <li key={ev.evidenceId}>
                            <button
                              type="button"
                              onClick={() => setEnlargedPhoto(url)}
                              title="Click to view full image"
                              className="block overflow-hidden rounded-lg border border-console-line"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt="Evidence photo"
                                className="size-20 object-cover"
                              />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-[13px] text-console-muted">
                      No photo evidence attached.
                    </p>
                  )}

                  <h4 className="mt-4 text-[12px] font-bold tracking-[0.12em] text-console-muted uppercase">
                    Fine
                  </h4>
                  {citation.recordType === "warning" ? (
                    <p className="mt-1.5 text-[14px] font-semibold text-ink">
                      No fine — warning only
                    </p>
                  ) : (
                    <p className="tabular-nums mt-1.5 text-[18px] font-bold text-ink">
                      {formatPeso(toNumber(citation.fineAmount))}
                    </p>
                  )}
                  {citation.fineOverrideReason ? (
                    <p className="mt-1 text-[12px] text-console-muted">
                      Overridden: {citation.fineOverrideReason}
                    </p>
                  ) : null}

                  <h4 className="mt-4 text-[12px] font-bold tracking-[0.12em] text-console-muted uppercase">
                    Status
                  </h4>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <StatusChip status={citation.settlementStatus} />
                    <span className="text-[12.5px] font-semibold text-console-muted">
                      {citation.verified ? "Verified" : "Not yet verified"}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-console-muted">
                    Issued by{" "}
                    {citation.enforcer
                      ? `Officer ${citation.enforcer.lastName}${citation.enforcer.badgeNumber ? ` (${citation.enforcer.badgeNumber})` : ""}`
                      : "—"}
                  </p>
                </div>
              </div>

              {showOverride ? (
                <form
                  onSubmit={handleOverrideSubmit}
                  className="mt-4 rounded-xl border border-console-line bg-console-canvas/60 p-4"
                >
                  <h4 className="text-[13px] font-bold text-ink">Override fine amount</h4>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <FormField
                      label="New fine amount (₱)"
                      required
                      type="number"
                      min="0"
                      max="99999999"
                      step="0.01"
                      value={overrideAmount}
                      onChange={(event) => setOverrideAmount(event.target.value)}
                      placeholder={String(toNumber(citation.fineAmount))}
                    />
                    <FormField
                      label="Reason"
                      required
                      value={overrideReason}
                      onChange={(event) => setOverrideReason(event.target.value)}
                      placeholder="e.g. Reduced per CTMO appeal decision"
                    />
                  </div>
                  {overrideError ? (
                    <NoticeBox tone="danger" className="mt-3 text-[13px]">
                      {overrideError}
                    </NoticeBox>
                  ) : null}
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowOverride(false)}
                      className="rounded-lg border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-brand-soft"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isActing}
                      className="rounded-lg bg-console-rail px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-console-rail-deep disabled:opacity-60"
                    >
                      {isActing ? "Saving…" : "Save Override"}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-console-line pt-4">
                {citation.driverUnderProtest ? (
                  <>
                    <button
                      type="button"
                      onClick={() => askProtest("dismiss")}
                      disabled={isActing}
                      className="rounded-lg border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-brand-soft disabled:opacity-60"
                    >
                      Dismiss Protest
                    </button>
                    <button
                      type="button"
                      onClick={() => askProtest("uphold")}
                      disabled={isActing || !isPending}
                      title={!isPending ? "Only unsettled citations can be cancelled through protest." : undefined}
                      className="rounded-lg border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-brand-soft disabled:opacity-60"
                    >
                      Uphold Protest
                    </button>
                  </>
                ) : null}
                {isPending ? (
                  <button
                    type="button"
                    onClick={askCancel}
                    disabled={isActing}
                    className="rounded-lg border border-signal-stop/40 bg-danger-soft px-3.5 py-2 text-[12.5px] font-semibold text-signal-stop hover:bg-danger-soft/70 disabled:opacity-60"
                  >
                    Cancel Citation
                  </button>
                ) : null}
                {isPayable ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setOverrideAmount(String(toNumber(citation.fineAmount)));
                        setOverrideReason("");
                        setOverrideError("");
                        setShowOverride(true);
                      }}
                      disabled={isActing}
                      className="rounded-lg border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-brand-soft disabled:opacity-60"
                    >
                      Override Fine
                    </button>
                    <button
                      type="button"
                      onClick={askRemind}
                      disabled={isActing}
                      className="rounded-lg border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-brand-soft disabled:opacity-60"
                    >
                      Send Reminder
                    </button>
                    <button
                      type="button"
                      onClick={askSettle}
                      disabled={isActing}
                      className="rounded-lg bg-console-rail px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-console-rail-deep disabled:opacity-60"
                    >
                      {isActing ? "Working…" : "Mark as Settled"}
                    </button>
                  </>
                ) : null}
                {!citation.verified ? (
                  <button
                    type="button"
                    onClick={askVerify}
                    disabled={isActing}
                    className="rounded-lg bg-brand-500 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                  >
                    {isActing ? "Working…" : "Mark as Verified"}
                  </button>
                ) : null}
              </div>
              {citation.recordType === "warning" ? (
                <p className="mt-3 inline-flex items-start gap-1.5 text-[12px] text-console-muted">
                  <TriangleAlert size={13} aria-hidden className="mt-px shrink-0" />
                  Warning — no fine is due and settlement actions do not apply.
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {confirm ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/55 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-label={confirm.title}
          onClick={() => !isActing && setConfirm(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-console-line bg-surface p-5 shadow-float"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className="font-display text-[15px] font-semibold tracking-tight text-ink">
              {confirm.title}
            </h4>
            <p className="mt-1.5 text-[13px] leading-relaxed text-console-muted">
              {confirm.message}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={isActing}
                className="rounded-lg border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-brand-soft disabled:opacity-60"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void confirm.action()}
                disabled={isActing}
                className="rounded-lg bg-console-rail px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-console-rail-deep disabled:opacity-60"
              >
                {isActing ? "Working…" : confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {enlargedPhoto ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/75 p-4"
          onClick={() => setEnlargedPhoto(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Evidence photo — full size"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enlargedPhoto}
            alt="Evidence — full size"
            className="max-h-[90dvh] max-w-[90vw] rounded-lg"
          />
        </div>
      ) : null}
    </div>
  );
}
