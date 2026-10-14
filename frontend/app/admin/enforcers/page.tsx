"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCw, Search, ShieldCheck } from "lucide-react";

import EmptyState from "@/components/common/EmptyState";
import FormField from "@/components/common/FormField";
import NoticeBox from "@/components/common/NoticeBox";
import { getApiErrorMessage } from "@/lib/axios";
import {
  ENFORCER_STATUSES,
  enforcerService,
  type EnforcerPayload,
  type EnforcerRecord,
  type EnforcerStatus,
} from "@/services/enforcer.service";

const PAGE_LIMIT = 10;

type StatusFilter = EnforcerStatus | "all";

const STATUS_LABELS: Record<EnforcerStatus, string> = {
  active: "Active",
  on_leave: "On Leave",
  suspended: "Suspended",
  archived: "Archived",
};

const STATUS_TONE: Record<EnforcerStatus, string> = {
  active: "bg-go-soft text-go-ink",
  on_leave: "bg-warn-soft text-signal-hold",
  suspended: "bg-danger-soft text-signal-stop",
  archived: "bg-chip-neutral text-muted",
};

export default function AdminEnforcersPage() {
  const [enforcers, setEnforcers] = useState<EnforcerRecord[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedEnforcerId, setSelectedEnforcerId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [credentials, setCredentials] = useState<{
    username: string;
    temporaryPassword: string;
    context: string;
  } | null>(null);

  const load = useCallback(
    async (page: number, searchValue: string, statusValue: StatusFilter) => {
      setIsLoading(true);
      setLoadError("");
      try {
        const result = await enforcerService.listEnforcersPage({
          page,
          limit: PAGE_LIMIT,
          // Archived officers are hidden by default on the backend; the All
          // tab opts back in so nothing is silently missing.
          ...(statusValue === "all" ? { includeArchived: true } : { status: statusValue }),
          ...(searchValue.trim() ? { search: searchValue.trim() } : {}),
        });
        setEnforcers(result.enforcers);
        setPagination(result.pagination);
      } catch (err) {
        setEnforcers([]);
        setLoadError(getApiErrorMessage(err, "Unable to load enforcers."));
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(1, search, status), 0);
    return () => window.clearTimeout(timer);
  }, [load, search, status]);

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSearch(searchInput);
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold tracking-[0.18em] text-brand-600 uppercase">
            Enforcers
          </p>
          <h2 className="font-display mt-1.5 text-[22px] leading-tight font-semibold tracking-tight text-ink">
            Field officers
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-console-muted">
            Manage the officers who issue citations. Only active officers can sign
            in and file citations — suspend or archive accounts instead of
            deleting them.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-console-rail px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-console-rail-deep"
          >
            <ShieldCheck size={14} strokeWidth={2.3} aria-hidden />
            Add Enforcer
          </button>
          <button
            type="button"
            onClick={() => void load(pagination.page, search, status)}
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

      <form
        onSubmit={handleSearchSubmit}
        className="rise flex gap-2"
        role="search"
        aria-label="Search enforcers"
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
            placeholder="Search by name, badge, or employee ID…"
            aria-label="Search by name, badge, or employee ID"
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
        aria-label="Filter enforcers by status"
      >
        {(["all", ...ENFORCER_STATUSES] as const).map((entry) => {
          const isActive = status === entry;
          return (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setStatus(entry)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                isActive
                  ? "border-console-rail bg-console-rail text-white"
                  : "border-console-line bg-surface text-ink hover:border-brand-300 hover:bg-brand-soft"
              }`}
            >
              {entry === "all" ? "All" : STATUS_LABELS[entry]}
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
          <ShieldCheck size={16} strokeWidth={2.1} className="shrink-0 text-brand-600" aria-hidden />
          <h3 className="font-display text-[15px] leading-none font-semibold tracking-tight text-ink">
            Enforcers
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
        ) : enforcers.length === 0 ? (
          <EmptyState title="No enforcers found">
            Nothing matches this filter. Add an officer to let them sign in to the
            field app.
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-left">
                <caption className="sr-only">Enforcers matching the current filter</caption>
                <thead>
                  <tr className="border-b border-console-line bg-console-canvas/70 text-[10.5px] tracking-[0.14em] text-console-muted uppercase">
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Officer
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      IDs
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Station
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Issued
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
                  {enforcers.map((enforcer) => (
                    <tr
                      key={enforcer.enforcerId}
                      className="border-b border-console-line/70 transition-colors last:border-0 hover:bg-brand-50/70"
                    >
                      <td className="px-5 py-3.5 align-top">
                        <p className="text-[13px] font-bold text-ink">
                          {enforcer.lastName}, {enforcer.firstName}
                        </p>
                        <p className="mt-1 text-[11.5px] leading-none text-console-muted">
                          @{enforcer.username || "—"}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 align-top text-[13px] text-ink/80">
                        <span className="tabular">{enforcer.employeeId}</span>
                        {enforcer.badgeNumber ? (
                          <span className="tabular mt-0.5 block text-[12px] text-console-muted">
                            Badge {enforcer.badgeNumber}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3.5 align-top text-[13px] text-ink/80">
                        {enforcer.station || "—"}
                      </td>
                      <td className="tabular px-5 py-3.5 align-top text-[13px] font-bold text-ink">
                        {enforcer.citationsIssued ?? "—"}
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-[3px] text-[11px] leading-tight font-bold ${enforcer.status ? STATUS_TONE[enforcer.status] : STATUS_TONE.active}`}
                        >
                          {enforcer.status ? STATUS_LABELS[enforcer.status] : "Active"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <button
                          type="button"
                          onClick={() => setSelectedEnforcerId(enforcer.enforcerId)}
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
                  onClick={() => void load(pagination.page - 1, search, status)}
                  className="rounded-lg border border-console-line bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages || isLoading}
                  onClick={() => void load(pagination.page + 1, search, status)}
                  className="rounded-lg border border-console-line bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {selectedEnforcerId !== null ? (
        <EnforcerDetailDialog
          enforcerId={selectedEnforcerId}
          onClose={() => setSelectedEnforcerId(null)}
          onChanged={() => void load(pagination.page, search, status)}
          onShowCredentials={(username, temporaryPassword, context) =>
            setCredentials({ username, temporaryPassword, context })
          }
        />
      ) : null}

      {showAdd ? (
        <EnforcerFormDialog
          title="Add enforcer"
          submitLabel="Create Enforcer"
          onClose={() => setShowAdd(false)}
          onSubmit={async (payload) => {
            // Safe: the form requires employee ID in create mode (see
            // handleSubmit validation), so the partial is complete here.
            const created = await enforcerService.createEnforcer(payload as EnforcerPayload);
            setShowAdd(false);
            await load(1, "", "all");
            setSearch("");
            setSearchInput("");
            setStatus("all");
            const createdWithPassword = created as EnforcerRecord & { temporaryPassword?: string };
            if (created.username && createdWithPassword.temporaryPassword) {
              setCredentials({
                username: created.username,
                temporaryPassword: createdWithPassword.temporaryPassword,
                context: `${created.firstName} ${created.lastName}`,
              });
            }
          }}
        />
      ) : null}

      {credentials ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/55 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-label="Enforcer credentials"
          onClick={() => setCredentials(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-console-line bg-surface p-5 shadow-float"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className="font-display text-[15px] font-semibold tracking-tight text-ink">
              Share these credentials — {credentials.context}
            </h4>
            <NoticeBox tone="warn" className="mt-3 text-[13px]">
              The temporary password is shown once and cannot be viewed again. Share
              it with the officer directly.
            </NoticeBox>
            <dl className="mt-3 space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-console-muted">Username</dt>
                <dd className="tabular font-bold text-ink">{credentials.username}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-console-muted">Temporary password</dt>
                <dd className="tabular font-bold text-ink">{credentials.temporaryPassword}</dd>
              </div>
            </dl>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setCredentials(null)}
                className="rounded-lg bg-console-rail px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-console-rail-deep"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EnforcerDetailDialog({
  enforcerId,
  onClose,
  onChanged,
  onShowCredentials,
}: {
  enforcerId: number;
  onClose: () => void;
  onChanged: () => void;
  onShowCredentials: (username: string, temporaryPassword: string, context: string) => void;
}) {
  const [enforcer, setEnforcer] = useState<EnforcerRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isActing, setIsActing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [statusValue, setStatusValue] = useState<EnforcerStatus>("active");
  const [confirmReset, setConfirmReset] = useState(false);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const record = await enforcerService.getEnforcer(enforcerId);
      setEnforcer(record);
    } catch (err) {
      setEnforcer(null);
      setErrorMessage(getApiErrorMessage(err, "Unable to load this enforcer."));
    } finally {
      setIsLoading(false);
    }
  }, [enforcerId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !showEdit && !showStatus && !confirmReset) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, showEdit, showStatus, confirmReset]);

  async function handleStatusSave() {
    if (isActing) return;
    setIsActing(true);
    setActionError("");
    try {
      await enforcerService.updateEnforcerStatus(enforcerId, statusValue);
      setShowStatus(false);
      setActionNotice(`Officer status set to ${STATUS_LABELS[statusValue]}.`);
      await reload();
      onChanged();
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Unable to update status."));
    } finally {
      setIsActing(false);
    }
  }

  async function handleResetPassword() {
    if (isActing) return;
    setIsActing(true);
    setActionError("");
    try {
      const result = await enforcerService.resetPassword(enforcerId);
      setConfirmReset(false);
      onShowCredentials(
        result.username,
        result.temporaryPassword,
        enforcer ? `${enforcer.firstName} ${enforcer.lastName}` : "officer"
      );
      setActionNotice("Password reset — new temporary password issued.");
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Unable to reset password."));
    } finally {
      setIsActing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-4 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={enforcer ? `Enforcer ${enforcer.firstName} ${enforcer.lastName}` : "Enforcer details"}
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-console-line bg-surface shadow-float"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-2.5 border-b border-console-line px-5 py-3.5">
          <ShieldCheck size={16} strokeWidth={2.1} className="shrink-0 text-brand-600" aria-hidden />
          <h3 className="font-display min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-ink">
            {enforcer ? `${enforcer.lastName}, ${enforcer.firstName}` : "Enforcer details"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close enforcer details"
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
          ) : errorMessage || !enforcer ? (
            <NoticeBox tone="danger" className="text-[13px]">
              {errorMessage || "Enforcer not found."}
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

              <dl className="grid gap-x-6 gap-y-1.5 text-[13px] text-ink/80 sm:grid-cols-2">
                <div className="flex justify-between gap-3">
                  <dt className="text-console-muted">Username</dt>
                  <dd className="tabular text-right font-semibold text-ink">
                    {enforcer.username || "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-console-muted">Employee ID</dt>
                  <dd className="tabular text-right font-semibold text-ink">{enforcer.employeeId}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-console-muted">Badge</dt>
                  <dd className="text-right">{enforcer.badgeNumber || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-console-muted">Station</dt>
                  <dd className="text-right">{enforcer.station || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-console-muted">Contact</dt>
                  <dd className="text-right">{enforcer.contactNumber || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-console-muted">Address</dt>
                  <dd className="text-right">{enforcer.address || "—"}</dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-[3px] text-[11px] leading-tight font-bold ${enforcer.status ? STATUS_TONE[enforcer.status] : STATUS_TONE.active}`}
                >
                  {enforcer.status ? STATUS_LABELS[enforcer.status] : "Active"}
                </span>
                <span className="text-[12px] text-console-muted">
                  Suspended and archived officers cannot sign in or issue citations.
                </span>
              </div>

              {showStatus ? (
                <div className="mt-4 rounded-xl border border-console-line bg-console-canvas/60 p-4">
                  <h4 className="text-[13px] font-bold text-ink">Change status</h4>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ENFORCER_STATUSES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setStatusValue(value)}
                        aria-pressed={statusValue === value}
                        className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                          statusValue === value
                            ? "border-console-rail bg-console-rail text-white"
                            : "border-console-line bg-surface text-ink hover:border-brand-300 hover:bg-brand-soft"
                        }`}
                      >
                        {STATUS_LABELS[value]}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowStatus(false)}
                      className="rounded-lg border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-brand-soft"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleStatusSave()}
                      disabled={isActing}
                      className="rounded-lg bg-console-rail px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-console-rail-deep disabled:opacity-60"
                    >
                      {isActing ? "Saving…" : "Save Status"}
                    </button>
                  </div>
                </div>
              ) : null}

              {confirmReset ? (
                <div className="mt-4 rounded-xl border border-signal-stop/40 bg-danger-soft/50 p-4">
                  <h4 className="text-[13px] font-bold text-ink">Reset this officer&apos;s password?</h4>
                  <p className="mt-1 text-[12.5px] text-console-muted">
                    A new random temporary password is generated and shown once. The
                    current password stops working immediately.
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      disabled={isActing}
                      className="rounded-lg border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-brand-soft disabled:opacity-60"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleResetPassword()}
                      disabled={isActing}
                      className="rounded-lg bg-signal-stop px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-signal-stop/90 disabled:opacity-60"
                    >
                      {isActing ? "Working…" : "Reset Password"}
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-console-line pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setStatusValue(enforcer.status ?? "active");
                    setShowStatus((open) => !open);
                    setShowEdit(false);
                    setConfirmReset(false);
                  }}
                  className="rounded-lg border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-brand-soft"
                >
                  Change Status
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmReset((open) => !open);
                    setShowStatus(false);
                    setShowEdit(false);
                  }}
                  className="rounded-lg border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-brand-soft"
                >
                  Reset Password
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEdit((open) => !open);
                    setShowStatus(false);
                    setConfirmReset(false);
                  }}
                  className="rounded-lg bg-console-rail px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-console-rail-deep"
                >
                  Edit Details
                </button>
              </div>

              {showEdit ? (
                <div className="mt-4">
                  <EnforcerFormDialog
                    inline
                    title="Edit enforcer"
                    submitLabel="Save Changes"
                    initial={enforcer}
                    onClose={() => setShowEdit(false)}
                    onSubmit={async (payload) => {
                      try {
                        const updated = await enforcerService.updateEnforcer(enforcerId, payload);
                        setEnforcer(updated);
                        setActionNotice("Enforcer updated.");
                        setActionError("");
                        await reload();
                        onChanged();
                        setShowEdit(false);
                      } catch (err) {
                        setActionError(getApiErrorMessage(err, "Unable to update enforcer."));
                      }
                    }}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EnforcerFormDialog({
  title,
  submitLabel,
  initial,
  inline,
  requireEmployeeId,
  onClose,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initial?: EnforcerRecord | null;
  inline?: boolean;
  requireEmployeeId?: boolean;
  onClose: () => void;
  // Partial: PATCH /enforcers/:id accepts any subset (updateEnforcer takes
  // Partial<EnforcerPayload>); the create caller validates employeeId itself.
  onSubmit: (payload: Partial<EnforcerPayload>) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [employeeId, setEmployeeId] = useState(initial?.employeeId ?? "");
  const [badgeNumber, setBadgeNumber] = useState(initial?.badgeNumber ?? "");
  const [station, setStation] = useState(initial?.station ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [contactNumber, setContactNumber] = useState(initial?.contactNumber ?? "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim() || (!initial && !employeeId.trim())) {
      setError("First name, last name, and employee ID number are required.");
      return;
    }
    setIsSubmitting(true);
    try {
      // PATCH /enforcers/:id accepts partial payloads; POST requires the
      // employee ID. Only send fields the form owns.
      await onSubmit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(!initial || requireEmployeeId
          ? employeeId.trim()
            ? { employeeId: employeeId.trim() }
            : {}
          : {}),
        ...(badgeNumber.trim() ? { badgeNumber: badgeNumber.trim() } : {}),
        ...(station.trim() ? { station: station.trim() } : {}),
        ...(address.trim() ? { address: address.trim() } : {}),
        ...(contactNumber.trim() ? { contactNumber: contactNumber.trim() } : {}),
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "Unable to save enforcer."));
      setIsSubmitting(false);
    }
  }

  const form = (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="First name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Juan" />
        <FormField label="Last name" required value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="e.g. Santos" />
      </div>
      {!initial ? (
        <FormField label="Enforcer ID number" required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="e.g. ENF-2024-001" />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Badge number" value={badgeNumber} onChange={(e) => setBadgeNumber(e.target.value)} placeholder="e.g. B-4592" />
        <FormField label="Station" value={station} onChange={(e) => setStation(e.target.value)} placeholder="e.g. Cordova Station" />
      </div>
      <FormField label="Address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Home address" />
      <FormField label="Contact number" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="e.g. 09171234567" />
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
          {isSubmitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );

  if (inline) {
    return (
      <div className="rounded-xl border border-console-line bg-console-canvas/60 p-4">
        <h4 className="text-[13px] font-bold text-ink">{title}</h4>
        {form}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-console-line bg-surface p-5 shadow-float"
        onClick={(event) => event.stopPropagation()}
      >
        <h4 className="font-display text-[15px] font-semibold tracking-tight text-ink">{title}</h4>
        <p className="mt-1 text-[12.5px] text-console-muted">
          The username and a temporary password are generated automatically — share
          them with the officer directly.
        </p>
        {form}
      </div>
    </div>
  );
}
