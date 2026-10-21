"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Banknote,
  ChartColumn,
  CircleCheckBig,
  Clock,
  Flag,
  RotateCw,
  ScrollText,
  ShieldCheck,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";

import { formatPeso, formatShortDateManila, formatTimeManila } from "@/components/common/dates";
import EmptyState from "@/components/common/EmptyState";
import NoticeBox from "@/components/common/NoticeBox";
import StatusChip from "@/components/common/StatusChip";
import TablePagination, { TABLE_PAGE_SIZE } from "@/components/common/TablePagination";
import { useAuth } from "@/context/AuthContext";
import { RECORD_TYPE_LABELS, isRecordType } from "@/constants/violations";
import { getApiErrorMessage } from "@/lib/axios";
import {
  citationService,
  type CitationPagination,
  type CitationRecord,
} from "@/services/citation.service";
import {
  dashboardService,
  type DashboardSummary,
  type DashboardTrendPoint,
  type RecentActivityItem,
} from "@/services/dashboard.service";

/** Fixed pixel height of the bar plot, so the bars can size themselves in %. */
const PLOT_HEIGHT = 132;

/**
 * Money and counts come out of DECIMAL columns, so they arrive as strings and
 * occasionally as null. Nothing is rendered straight from the response.
 */
function toNumber(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCount(value: string | number | null | undefined): string {
  return toNumber(value).toLocaleString("en-US");
}

/** "Tue" — pinned to UTC so the browser and the server agree on the label. */
function dayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

function timeAgo(timestamp: string): string {
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return "";

  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function AdminDashboardPage() {
  const { user } = useAuth();

  const [attempt, setAttempt] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trend, setTrend] = useState<DashboardTrendPoint[]>([]);
  const [activity, setActivity] = useState<RecentActivityItem[]>([]);
  const [citations, setCitations] = useState<CitationRecord[]>([]);
  const [citationPage, setCitationPage] = useState(1);
  const [citationPagination, setCitationPagination] = useState<CitationPagination>({
    page: 1,
    limit: TABLE_PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [isCitationsLoading, setIsCitationsLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [citationsError, setCitationsError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setSummaryError("");

      // Summary is the one call the page cannot do without; the trend and the
      // activity feed are each allowed to come back empty.
      const [summaryResult, trendResult, activityResult] = await Promise.allSettled([
        dashboardService.getSummary(),
        dashboardService.getTrend(),
        dashboardService.getRecentActivity(),
      ]);

      if (cancelled) return;

      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
      } else {
        setSummary(null);
        setSummaryError(
          getApiErrorMessage(summaryResult.reason, "Could not load the dashboard totals.")
        );
      }

      setTrend(trendResult.status === "fulfilled" ? trendResult.value : []);
      setActivity(activityResult.status === "fulfilled" ? activityResult.value : []);
      setIsLoading(false);
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
   * The register pages server-side, so it loads on its own: changing page (or
   * refreshing) reloads this table without touching the panels above.
   */
  useEffect(() => {
    let cancelled = false;

    const loadCitations = async () => {
      setIsCitationsLoading(true);
      setCitationsError(false);

      try {
        const result = await citationService.listCitationsPage({
          page: citationPage,
          limit: TABLE_PAGE_SIZE,
        });
        if (cancelled) return;

        setCitations(result.citations);
        setCitationPagination(result.pagination);

        // The register can shrink between loads; step back to the last real
        // page instead of stranding the table on an empty one.
        if (result.pagination.totalPages > 0 && citationPage > result.pagination.totalPages) {
          setCitationPage(result.pagination.totalPages);
        }
      } catch {
        if (cancelled) return;
        setCitationsError(true);
      } finally {
        if (!cancelled) setIsCitationsLoading(false);
      }
    };

    const timer = window.setTimeout(loadCitations, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [attempt, citationPage]);

  const firstName = user?.firstName?.trim();

  return (
    <div>
      {/* Lead-in: what this screen is, and a way to re-read it. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold tracking-[0.18em] text-brand-600 uppercase">
            Office overview
          </p>
          <h2 className="font-display mt-1.5 text-[22px] leading-tight font-semibold tracking-tight text-ink">
            Signed in as {firstName || "the administrator"}
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-console-muted">
            Every figure below comes from the backend dashboard endpoints and the citation
            register. Use the sidebar to manage drivers, officers, offences, violations,
            settlements, broadcasts, and the audit trail.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
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

      {summaryError ? (
        <NoticeBox tone="danger" className="mb-5 text-[13px]">
          {summaryError}
        </NoticeBox>
      ) : null}

      {/* Totals */}
      {isLoading && !summary ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="rounded-2xl border border-console-line bg-surface p-5 shadow-console"
            >
              <div className="breathe h-3 w-24 rounded-full bg-console-canvas" />
              <div className="breathe mt-4 h-8 w-16 rounded-lg bg-console-canvas [animation-delay:120ms]" />
              <div className="breathe mt-4 h-3 w-32 rounded-full bg-console-canvas [animation-delay:200ms]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Drivers"
            value={summary ? formatCount(summary.totalDrivers) : "—"}
            note="Accounts on the register, whatever their verification state."
            Icon={Users}
            tone="bg-info-soft text-signal-info"
            delay={0}
          />
          <StatCard
            label="Enforcers"
            value={summary ? formatCount(summary.totalEnforcers) : "—"}
            note="Officers who can issue citations from the field app."
            Icon={ShieldCheck}
            tone="bg-brand-soft text-brand-600"
            delay={70}
          />
          <StatCard
            label="Violations"
            value={summary ? formatCount(summary.totalViolations) : "—"}
            note="Citations and warnings issued to date."
            Icon={ScrollText}
            tone="bg-violet-soft text-signal-violet"
            delay={140}
          />
          <StatCard
            label="Unsettled amount"
            value={summary ? formatPeso(toNumber(summary.unsettledAmount)) : "—"}
            note={
              summary
                ? `${formatCount(summary.unsettledViolations)} ${
                    toNumber(summary.unsettledViolations) === 1
                      ? "record is"
                      : "records are"
                  } still awaiting payment.`
                : "Awaiting the dashboard totals."
            }
            Icon={Banknote}
            tone="bg-warn-soft text-warn-ink"
            delay={210}
          />
        </div>
      )}

      {/* Trend + activity */}
      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Panel
          title="Last seven days"
          hint="Settled against unsettled"
          Icon={ChartColumn}
          className="xl:col-span-2"
          delay={80}
        >
          <TrendPlot points={trend} />
        </Panel>

        <Panel title="Recent activity" hint="Newest first" Icon={Activity} delay={150}>
          <ActivityFeed items={activity} />
        </Panel>
      </div>

      {/* The register */}
      <Panel
        title="Citation register"
        hint={`${TABLE_PAGE_SIZE} per page`}
        Icon={ScrollText}
        className="mt-5"
        delay={220}
      >
        <CitationsTable rows={citations} failed={citationsError} loading={isCitationsLoading} />

        {!citationsError && citations.length > 0 ? (
          <TablePagination
            page={citationPage}
            totalPages={citationPagination.totalPages}
            total={citationPagination.total}
            onPageChange={setCitationPage}
            disabled={isCitationsLoading}
            itemLabel="citations"
          />
        ) : null}
      </Panel>
    </div>
  );
}

type StatCardProps = {
  label: string;
  value: string;
  note: string;
  Icon: LucideIcon;
  /** Tile colours for the icon — one per figure, so the row reads as four. */
  tone: string;
  delay: number;
};

function StatCard({ label, value, note, Icon, tone, delay }: StatCardProps) {
  return (
    <article
      className="rise rounded-2xl border border-console-line bg-surface p-5 shadow-console"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10.5px] leading-none font-bold tracking-[0.16em] text-console-muted uppercase">
          {label}
        </p>
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone}`}>
          <Icon size={17} strokeWidth={2.1} aria-hidden />
        </span>
      </div>

      <p className="font-display tabular-nums mt-3.5 text-[32px] leading-none font-semibold tracking-tight text-ink">
        {value}
      </p>

      <p className="mt-2.5 text-[12px] leading-relaxed text-console-muted">{note}</p>
    </article>
  );
}

type PanelProps = {
  title: string;
  hint?: string;
  Icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
  delay?: number;
};

/** The console's one panel shape: title row, hairline, body. */
function Panel({ title, hint, Icon, children, className = "", delay = 0 }: PanelProps) {
  return (
    <section
      className={`rise overflow-hidden rounded-2xl border border-console-line bg-surface shadow-console ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <header className="flex items-center gap-2.5 border-b border-console-line px-5 py-3.5">
        <Icon size={16} strokeWidth={2.1} className="shrink-0 text-brand-600" aria-hidden />
        <h3 className="font-display text-[15px] leading-none font-semibold tracking-tight text-ink">
          {title}
        </h3>
        {hint ? (
          <p className="ml-auto shrink-0 text-[11.5px] leading-none text-console-muted">
            {hint}
          </p>
        ) : null}
      </header>

      {children}
    </section>
  );
}

/** Seven days of settled and unsettled citations as paired bars. */
function TrendPlot({ points }: { points: DashboardTrendPoint[] }) {
  const peak = Math.max(
    1,
    ...points.map((point) => toNumber(point.settled) + toNumber(point.unsettled))
  );
  const hasData = points.some((point) => toNumber(point.settled) + toNumber(point.unsettled) > 0);

  if (points.length === 0 || !hasData) {
    return (
      <EmptyState title="No citation activity in the last seven days">
        Enforcers issue citations from the field app, so anything they write lands here the
        same day.
      </EmptyState>
    );
  }

  return (
    <div>
      <div className="flex items-end gap-2 px-5 pt-6 sm:gap-3">
        {points.map((point, index) => {
          const settled = toNumber(point.settled);
          const unsettled = toNumber(point.unsettled);
          const total = settled + unsettled;

          return (
            <div
              key={point.date}
              className="flex h-full flex-1 flex-col items-center gap-2"
              title={`${point.date}: ${settled} settled, ${unsettled} unsettled`}
            >
              <div
                className="rise-sm flex w-full items-end justify-center gap-1"
                style={{ height: PLOT_HEIGHT, animationDelay: `${index * 55}ms` }}
              >
                <div
                  className="w-1/2 max-w-7 rounded-t-[4px] bg-brand-500"
                  style={{ height: `${(settled / peak) * 100}%` }}
                />
                <div
                  className="w-1/2 max-w-7 rounded-t-[4px] bg-signal-hold"
                  style={{ height: `${(unsettled / peak) * 100}%` }}
                />
              </div>

              <span className="tabular-nums text-[10.5px] leading-none font-semibold text-console-muted">
                {total}
              </span>
              <span className="text-[11px] leading-none font-semibold text-ink/70">
                {dayLabel(point.date)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-5 border-t border-console-line px-5 py-3">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-console-muted">
          <CircleCheckBig size={13} strokeWidth={2.4} className="text-brand-500" aria-hidden />
          Settled
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-console-muted">
          <Clock size={13} strokeWidth={2.4} className="text-signal-hold" aria-hidden />
          Unsettled
        </span>
      </div>
    </div>
  );
}

function ActivityFeed({ items }: { items: RecentActivityItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState title="Nothing logged yet">
        Issued citations and warnings show up here as enforcers file them.
      </EmptyState>
    );
  }

  return (
    <ul className="divide-y divide-console-line">
      {items.map((item, index) => (
        <li key={`${item.timestamp}-${index}`} className="flex gap-3 px-5 py-3.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-600">
            {item.type === "warning_issued" ? (
              <TriangleAlert size={15} strokeWidth={2.2} aria-hidden />
            ) : (
              <ScrollText size={15} strokeWidth={2.2} aria-hidden />
            )}
          </span>

          <div className="min-w-0">
            <p className="text-[13px] leading-snug font-semibold text-ink">{item.description}</p>
            <p className="mt-1 text-[11.5px] leading-none text-console-muted">
              {timeAgo(item.timestamp)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CitationsTable({
  rows,
  failed,
  loading,
}: {
  rows: CitationRecord[];
  failed: boolean;
  loading: boolean;
}) {
  if (failed) {
    return (
      <NoticeBox tone="danger" className="m-5 text-[13px]">
        The citation register could not be read. Check that the backend is running, then
        refresh.
      </NoticeBox>
    );
  }

  // First load only: without this the empty state would flash before the rows
  // arrive. Later pages keep the current rows on screen while they load.
  if (loading && rows.length === 0) {
    return (
      <div className="space-y-3 px-5 py-4" aria-busy="true">
        <span className="sr-only">Loading citations</span>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
          <div
            key={index}
            className="breathe h-4 rounded-full bg-console-canvas"
            style={{ animationDelay: `${index * 60}ms` }}
          />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState title="No citations issued yet">
        The register fills up as enforcers issue citations from the field app.
      </EmptyState>
    );
  }

  return (
    <div className="overflow-x-auto" aria-busy={loading}>
      <table className="w-full min-w-[44rem] border-collapse text-left">
        <caption className="sr-only">Citations on record, newest first</caption>

        <thead>
          <tr className="border-b border-console-line bg-console-canvas/70 text-[10.5px] tracking-[0.14em] text-console-muted uppercase">
            <th scope="col" className="px-5 py-2.5 font-bold">
              Citation
            </th>
            <th scope="col" className="px-5 py-2.5 font-bold">
              Plate
            </th>
            <th scope="col" className="px-5 py-2.5 font-bold">
              Place
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
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr
              key={row.citationId}
              className="border-b border-console-line/70 transition-colors last:border-0 hover:bg-brand-50/70"
            >
              <td className="px-5 py-3.5 align-top">
                <p className="tabular-nums text-[13px] font-bold text-ink">{row.citationNumber}</p>
                <p className="mt-1 text-[11.5px] leading-none text-console-muted">
                  {isRecordType(row.recordType)
                    ? RECORD_TYPE_LABELS[row.recordType]
                    : "Record"}
                </p>
              </td>

              <td className="tabular-nums px-5 py-3.5 align-top text-[13px] font-semibold text-ink">
                {row.plateNumber || "—"}
              </td>

              <td className="px-5 py-3.5 align-top text-[13px] text-ink/80">
                {row.placeOfViolation || "—"}
              </td>

              <td className="px-5 py-3.5 align-top">
                <p className="text-[13px] leading-tight text-ink/80">
                  {formatShortDateManila(row.occurredAt)}
                </p>
                <p className="tabular-nums mt-1 text-[11.5px] leading-none text-console-muted">
                  {formatTimeManila(row.occurredAt)}
                </p>
              </td>

              <td className="tabular-nums px-5 py-3.5 text-right align-top text-[13px] font-bold text-ink">
                {formatPeso(toNumber(row.fineAmount))}
              </td>

              <td className="px-5 py-3.5 align-top">
                <div className="flex flex-col items-start gap-1.5">
                  <StatusChip status={row.settlementStatus} />
                  {row.driverUnderProtest ? (
                    <span className="inline-flex items-center gap-1 text-[11px] leading-none font-bold text-signal-stop">
                      <Flag size={11} strokeWidth={2.6} aria-hidden />
                      Protest
                    </span>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}