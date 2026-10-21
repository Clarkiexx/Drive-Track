"use client";

import { useCallback, useEffect, useState } from "react";
import { NotebookPen, RotateCw } from "lucide-react";

import EmptyState from "@/components/common/EmptyState";
import NoticeBox from "@/components/common/NoticeBox";
import { formatShortDateManila, formatTimeManila } from "@/components/common/dates";
import { getApiErrorMessage } from "@/lib/axios";
import {
  auditLogService,
  type AuditLogRecord,
} from "@/services/audit-log.service";

/** Every console table pages eight rows at a time. */
const PAGE_LIMIT = 8;

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async (page: number) => {
    setIsLoading(true);
    setLoadError("");
    try {
      const result = await auditLogService.listAuditLogs({ page, limit: PAGE_LIMIT });
      setLogs(result.logs);
      setPagination(result.pagination);
    } catch (err) {
      setLogs([]);
      setLoadError(getApiErrorMessage(err, "Unable to load audit log."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(1), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold tracking-[0.18em] text-brand-600 uppercase">
            Audit Log
          </p>
          <h2 className="font-display mt-1.5 text-[22px] leading-tight font-semibold tracking-tight text-ink">
            Privileged actions
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-console-muted">
            Every important action taken in this console is recorded here with the
            admin, target, and timestamp. This log is read-only.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load(pagination.page)}
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

      <section
        className="rise overflow-hidden rounded-2xl border border-console-line bg-surface shadow-console"
        aria-live="polite"
      >
        <header className="flex items-center gap-2.5 border-b border-console-line px-5 py-3.5">
          <NotebookPen size={16} strokeWidth={2.1} className="shrink-0 text-brand-600" aria-hidden />
          <h3 className="font-display text-[15px] leading-none font-semibold tracking-tight text-ink">
            Audit trail
          </h3>
          <p className="ml-auto shrink-0 text-[11.5px] leading-none text-console-muted">
            {pagination.total} entries
          </p>
        </header>

        {isLoading ? (
          <ul aria-hidden className="divide-y divide-console-line/70">
            {[0, 1, 2, 3, 4].map((index) => (
              <li key={index} className="flex items-center gap-3 px-5 py-4">
                <div className="breathe h-3 w-28 rounded-full bg-console-canvas" />
                <div className="breathe h-3 w-40 rounded-full bg-console-canvas [animation-delay:120ms]" />
                <div className="breathe ml-auto h-3 w-24 rounded-full bg-console-canvas [animation-delay:200ms]" />
              </li>
            ))}
          </ul>
        ) : loadError ? (
          <div className="p-5">
            <NoticeBox tone="danger" className="text-[13px]">
              {loadError}
            </NoticeBox>
          </div>
        ) : logs.length === 0 ? (
          <EmptyState title="No audit entries yet">
            Actions like verifying citations, changing statuses, and sending
            broadcasts are recorded here automatically.
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse text-left">
                <caption className="sr-only">Audit log entries, newest first</caption>
                <thead>
                  <tr className="border-b border-console-line bg-console-canvas/70 text-[10.5px] tracking-[0.14em] text-console-muted uppercase">
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Timestamp
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Admin
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Action
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Target
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((entry) => (
                    <tr
                      key={entry.auditLogId}
                      className="border-b border-console-line/70 transition-colors last:border-0 hover:bg-brand-50/70"
                    >
                      <td className="px-5 py-3.5 align-top whitespace-nowrap">
                        <p className="text-[13px] leading-tight text-ink/80">
                          {formatShortDateManila(entry.createdAt)}
                        </p>
                        <p className="tabular-nums mt-1 text-[11.5px] leading-none text-console-muted">
                          {formatTimeManila(entry.createdAt)}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 align-top text-[13px] text-ink/80">
                        {entry.admin
                          ? `${entry.admin.firstName ?? ""} ${entry.admin.lastName ?? ""}`.trim() ||
                            entry.admin.username ||
                            `Admin #${entry.adminId}`
                          : `Admin #${entry.adminId}`}
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <code className="tabular-nums rounded-md bg-console-canvas px-2 py-1 text-[12px] font-semibold text-ink">
                          {entry.action}
                        </code>
                      </td>
                      <td className="tabular-nums px-5 py-3.5 align-top text-[13px] text-ink/80">
                        {entry.targetType}
                        {entry.targetId !== null && entry.targetId !== undefined
                          ? ` #${entry.targetId}`
                          : ""}
                      </td>
                      <td className="max-w-72 px-5 py-3.5 align-top text-[13px] text-ink/80">
                        <span className="block truncate" title={entry.details || ""}>
                          {entry.details || "—"}
                        </span>
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
                  onClick={() => void load(pagination.page - 1)}
                  className="rounded-lg border border-console-line bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages || isLoading}
                  onClick={() => void load(pagination.page + 1)}
                  className="rounded-lg border border-console-line bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
