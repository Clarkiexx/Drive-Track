"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, RotateCw, Search } from "lucide-react";

import EmptyState from "@/components/common/EmptyState";
import FormField from "@/components/common/FormField";
import NoticeBox from "@/components/common/NoticeBox";
import StatusChip from "@/components/common/StatusChip";
import {
  dueInfo,
  formatPeso,
  formatShortDate,
} from "@/components/common/dates";
import useClientNow from "@/components/common/useClientNow";
import { PAYMENT_METHODS, type PaymentMethod } from "@/constants/violations";
import { useAuth } from "@/context/AuthContext";
import { getApiErrorMessage } from "@/lib/axios";
import {
  citationService,
  type CitationRecord,
} from "@/services/citation.service";
import { dashboardService } from "@/services/dashboard.service";

/** Rows per settlements page. */
const PAGE_LIMIT = 10;

type SettlementTab = "unsettled" | "settled" | "all";

const TABS: ReadonlyArray<{ key: SettlementTab; label: string }> = [
  { key: "unsettled", label: "Unsettled & Overdue" },
  { key: "settled", label: "Settled" },
  { key: "all", label: "All Records" },
];

/**
 * Settlements is a filtered view of the citation register, not a separate
 * resource: the backend has no settlement table. Warnings never carry a fine,
 * so every query pins `recordType=citation` server-side (keeps pagination
 * counts correct — never fetch-all-and-filter client-side).
 */
function statusForTab(tab: SettlementTab): string | undefined {
  if (tab === "unsettled") return "pending";
  if (tab === "settled") return "settled";
  return undefined;
}

function toNumber(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function AdminSettlementsPage() {
  const { user } = useAuth();
  const clientNow = useClientNow();
  const now = clientNow;

  const [citations, setCitations] = useState<CitationRecord[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<SettlementTab>("unsettled");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [unsettledAmount, setUnsettledAmount] = useState<number | null>(null);
  const [payingCitation, setPayingCitation] = useState<CitationRecord | null>(null);
  const [receiptCitation, setReceiptCitation] = useState<CitationRecord | null>(null);
  const [remindingId, setRemindingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");

  const load = useCallback(async (page: number, searchValue: string, tabValue: SettlementTab) => {
    setIsLoading(true);
    setLoadError("");
    try {
      const status = statusForTab(tabValue);
      const result = await citationService.listCitationsPage({
        page,
        limit: PAGE_LIMIT,
        recordType: "citation",
        ...(searchValue.trim() ? { search: searchValue.trim() } : {}),
        ...(status ? { status: status as never } : {}),
      });
      setCitations(result.citations);
      setPagination(result.pagination);
    } catch (err) {
      setCitations([]);
      setLoadError(getApiErrorMessage(err, "Unable to load settlements."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadUnsettledTotal = useCallback(async () => {
    try {
      const summary = await dashboardService.getSummary();
      setUnsettledAmount(toNumber(summary.unsettledAmount));
    } catch {
      setUnsettledAmount(null);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(1, search, tab);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, search, tab]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadUnsettledTotal(), 0);
    return () => window.clearTimeout(timer);
  }, [loadUnsettledTotal]);

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSearch(searchInput);
  };

  async function handleRemind(citation: CitationRecord) {
    if (remindingId !== null) return;
    setRemindingId(citation.citationId);
    setActionError("");
    setActionNotice("");
    try {
      await citationService.sendReminder(citation.citationId);
      setActionNotice(
        `Reminder sent to ${citation.driver ? `${citation.driver.firstName} ${citation.driver.lastName}` : "driver"}.`
      );
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Unable to send reminder."));
    } finally {
      setRemindingId(null);
    }
  }

  async function handleConfirmPaid(method: PaymentMethod, reference: string) {
    if (!payingCitation) return;
    // Throws on failure so the dialog can show the backend message inline.
    await citationService.settleCitation(payingCitation.citationId, {
      paymentMethod: method,
      paymentReference: reference,
    });
    setPayingCitation(null);
    setActionNotice(`Citation ${payingCitation.citationNumber} marked as settled.`);
    setActionError("");
    await load(pagination.page, search, tab);
    await loadUnsettledTotal();
  }

  function handleExportCsv() {
    const header = ["Citation No", "Driver", "Amount", "Due Date", "Status", "Payment Method", "Reference", "Settled At"];
    const rows = citations.map((c) => [
      c.citationNumber,
      c.driver ? `${c.driver.firstName} ${c.driver.lastName}`.trim() : "",
      String(toNumber(c.fineAmount)),
      c.dueDate || "",
      c.settlementStatus,
      c.paymentMethod || "",
      c.paymentReference || "",
      c.settledAt || "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `settlements-${tab}-p${pagination.page}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const adminName =
    user?.firstName || user?.lastName
      ? `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim()
      : "System Admin";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold tracking-[0.18em] text-brand-600 uppercase">
            Settlements
          </p>
          <h2 className="font-display mt-1.5 text-[22px] leading-tight font-semibold tracking-tight text-ink">
            Settlement management
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-console-muted">
            Record office payments against real citations. Settling notifies the
            driver automatically and updates the dashboard&apos;s unsettled total.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {tab === "unsettled" && unsettledAmount !== null ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-go-soft px-3.5 py-2 text-[12.5px] font-bold text-go-ink">
              <Banknote size={14} strokeWidth={2.3} aria-hidden />
              Total Unsettled: {formatPeso(unsettledAmount)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void load(pagination.page, search, tab);
              void loadUnsettledTotal();
            }}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink shadow-console transition-colors hover:border-brand-300 hover:bg-brand-soft disabled:opacity-60"
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
      </div>

      {actionError ? (
        <NoticeBox tone="danger" className="mb-4 text-[13px]">
          {actionError}
        </NoticeBox>
      ) : null}
      {actionNotice ? (
        <NoticeBox tone="success" className="mb-4 text-[13px]">
          {actionNotice}
        </NoticeBox>
      ) : null}

      <section
        className="rise overflow-hidden rounded-2xl border border-console-line bg-surface shadow-console"
        aria-live="polite"
      >
        <div className="flex gap-1 overflow-x-auto border-b border-console-line px-3">
          {TABS.map((entry) => {
            const isActive = tab === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(entry.key)}
                className={`shrink-0 border-b-2 px-4 py-3.5 text-[13px] transition-colors ${
                  isActive
                    ? "border-brand-500 font-bold text-brand-700"
                    : "border-transparent font-medium text-console-muted hover:text-ink"
                }`}
              >
                {entry.label}
              </button>
            );
          })}
        </div>

        <form
          onSubmit={handleSearchSubmit}
          className="flex gap-2 border-b border-console-line px-5 py-3.5"
          role="search"
          aria-label="Search settlements"
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
            type="button"
            onClick={handleExportCsv}
            disabled={citations.length === 0}
            title="Exports only the rows shown on this page"
            className="shrink-0 rounded-[10px] border border-console-line bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft disabled:opacity-50"
          >
            ⬇ Export page
          </button>
        </form>

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
          <EmptyState title="No records found">
            {tab === "unsettled"
              ? "Nothing is awaiting payment — every citation fine is settled or cancelled."
              : "No citations match this view yet."}
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse text-left">
                <caption className="sr-only">Settlement records, newest first</caption>
                <thead>
                  <tr className="border-b border-console-line bg-console-canvas/70 text-[10.5px] tracking-[0.14em] text-console-muted uppercase">
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Citation
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Driver
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-right font-bold">
                      Amount
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Due
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Payment
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
                  {citations.map((citation) => {
                    const due = citation.dueDate && now != null ? dueInfo(citation.dueDate, now) : null;
                    const overdue =
                      citation.settlementStatus === "pending" && due?.urgency === "overdue";
                    return (
                      <tr
                        key={citation.citationId}
                        className="border-b border-console-line/70 transition-colors last:border-0 hover:bg-brand-50/70"
                      >
                        <td className="tabular-nums px-5 py-3.5 align-top text-[13px] font-bold text-ink">
                          {citation.citationNumber}
                        </td>
                        <td className="px-5 py-3.5 align-top text-[13px] text-ink/80">
                          {citation.driver
                            ? `${citation.driver.firstName} ${citation.driver.lastName}`
                            : "—"}
                        </td>
                        <td className="tabular-nums px-5 py-3.5 text-right align-top text-[13px] font-bold text-ink">
                          {formatPeso(toNumber(citation.fineAmount))}
                        </td>
                        <td className="px-5 py-3.5 align-top text-[13px]">
                          {due ? (
                            <span
                              className={
                                overdue
                                  ? "font-bold text-signal-stop"
                                  : due.urgency === "soon"
                                    ? "font-semibold text-signal-hold"
                                    : "text-ink/80"
                              }
                            >
                              {due.label}
                            </span>
                          ) : (
                            <span className="text-console-muted">No due date</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 align-top text-[12.5px] text-ink/80">
                          {citation.settlementStatus === "settled"
                            ? `${citation.paymentMethod || "cash"}${citation.paymentReference ? ` • ${citation.paymentReference}` : ""}`
                            : "—"}
                        </td>
                        <td className="px-5 py-3.5 align-top">
                          <StatusChip status={citation.settlementStatus} />
                        </td>
                        <td className="px-5 py-3.5 align-top">
                          <div className="flex flex-wrap gap-1.5">
                            {citation.settlementStatus === "pending" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setPayingCitation(citation)}
                                  className="rounded-lg bg-console-rail px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-console-rail-deep"
                                >
                                  Mark Paid
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleRemind(citation)}
                                  disabled={remindingId === citation.citationId}
                                  className="rounded-lg border border-console-line bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft disabled:opacity-60"
                                >
                                  {remindingId === citation.citationId ? "Sending…" : "Remind"}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setReceiptCitation(citation)}
                                className="rounded-lg border border-console-line bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft"
                              >
                                🧾 Receipt
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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

      {payingCitation ? (
        <MarkPaidDialog
          citation={payingCitation}
          receivedBy={adminName}
          onClose={() => setPayingCitation(null)}
          onConfirm={handleConfirmPaid}
        />
      ) : null}

      {receiptCitation ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label={`Receipt — ${receiptCitation.citationNumber}`}
          onClick={() => setReceiptCitation(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-console-line bg-surface p-5 shadow-float"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className="font-display text-[15px] font-semibold tracking-tight text-ink">
              Receipt — {receiptCitation.citationNumber}
            </h4>
            <dl className="mt-3 space-y-1.5 text-[13px] text-ink/80">
              <div className="flex justify-between gap-3">
                <dt className="text-console-muted">Driver</dt>
                <dd className="text-right font-semibold text-ink">
                  {receiptCitation.driver
                    ? `${receiptCitation.driver.firstName} ${receiptCitation.driver.lastName}`
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-console-muted">Amount</dt>
                <dd className="tabular-nums text-right font-bold text-ink">
                  {formatPeso(toNumber(receiptCitation.fineAmount))}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-console-muted">Method</dt>
                <dd className="text-right">{receiptCitation.paymentMethod || "cash"}</dd>
              </div>
              {receiptCitation.paymentReference ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-console-muted">Reference</dt>
                  <dd className="tabular-nums text-right">{receiptCitation.paymentReference}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-console-muted">Settled</dt>
                <dd className="text-right">
                  {receiptCitation.settledAt
                    ? `${formatShortDate(receiptCitation.settledAt)}`
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-console-muted">Due was</dt>
                <dd className="text-right">
                  {receiptCitation.dueDate ? formatShortDate(receiptCitation.dueDate) : "—"}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setReceiptCitation(null)}
                className="rounded-lg bg-console-rail px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-console-rail-deep"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MarkPaidDialog({
  citation,
  receivedBy,
  onClose,
  onConfirm,
}: {
  citation: CitationRecord;
  receivedBy: string;
  onClose: () => void;
  onConfirm: (method: PaymentMethod, reference: string) => Promise<void>;
}) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    // Office payment discipline (mirrors admin-dashboard Settlements):
    // full amount only, OR/reference required — partial payments unsupported.
    if (!reference.trim()) {
      setError("Official Receipt / OR number is required for office payments.");
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfirm(method, reference.trim());
    } catch (err) {
      setError(getApiErrorMessage(err, "Unable to mark as paid."));
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Record office payment — ${citation.citationNumber}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-console-line bg-surface p-5 shadow-float"
        onClick={(event) => event.stopPropagation()}
      >
        <h4 className="font-display text-[15px] font-semibold tracking-tight text-ink">
          Record office payment — {citation.citationNumber}
        </h4>
        <p className="mt-1.5 text-[13px] text-ink/80">
          Amount due (full payment only):{" "}
          <strong className="tabular-nums">
            {formatPeso(Number(citation.fineAmount) || 0)}
          </strong>
        </p>
        <p className="mt-0.5 text-[12px] text-console-muted">
          Partial payments are not supported — the full citation amount is recorded
          as paid.
        </p>

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <div>
            <label
              htmlFor="settle-method"
              className="mb-1.5 block text-[13px] font-semibold text-ink"
            >
              Payment method
            </label>
            <select
              id="settle-method"
              value={method}
              onChange={(event) => setMethod(event.target.value as PaymentMethod)}
              className="dt-input"
            >
              {PAYMENT_METHODS.map((value) => (
                <option key={value} value={value}>
                  {value === "gcash" ? "GCash" : value.charAt(0).toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <FormField
            label="Official Receipt / OR No."
            required
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="e.g. OR-2026-000123"
          />
          <p className="text-[13px] text-ink/80">
            Received by: <strong>{receivedBy}</strong>
          </p>
          {error ? (
            <NoticeBox tone="danger" className="text-[13px]">
              {error}
            </NoticeBox>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-brand-soft"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-console-rail px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-console-rail-deep disabled:opacity-60"
            >
              {isSubmitting ? "Saving…" : "Confirm Paid"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
