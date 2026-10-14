"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleCheckBig,
  CircleDot,
  LoaderCircle,
  ScrollText,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import AppBar from "@/components/common/AppBar";
import BottomNav from "@/components/common/BottomNav";
import PageBody from "@/components/common/PageBody";
import NoticeBox from "@/components/common/NoticeBox";
import { formatShortDateManila } from "@/components/common/dates";
import { getApiErrorMessage } from "@/lib/axios";
import { citationService, type CitationRecord } from "@/services/citation.service";

/** RN's `recentActivity.slice(0, 5)`. */
const RECENT_ACTIVITY_LIMIT = 5;

export default function ViolationStatusPage() {
  const [violations, setViolations] = useState<CitationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      setViolations(await citationService.listMyViolations());
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(error, "Unable to load violation status.")
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * RN loaded on mount AND on every focus (useFocusEffect) — the overview and
   * the percentage go stale as soon as a payment settles, so the numbers must
   * be re-read when the driver comes back to the screen. The App Router has no
   * focus hook; window focus and tab visibility stand in for it.
   */
  useEffect(() => {
    const refresh = () => {
      void load();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    // Deferred rather than run in the effect body: the bearer token only exists
    // in the browser, so the first client render has to match the server's.
    const timer = window.setTimeout(refresh, 0);

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load]);

  const stats = useMemo(() => {
    const total = violations.length;
    const settled = violations.filter((v) => v.settlementStatus === "settled").length;
    const unsettled = violations.filter((v) => v.settlementStatus === "pending").length;
    const warnings = violations.filter((v) => v.recordType === "warning").length;

    /**
     * FAITHFUL TO RN: the denominator deliberately drops warnings (they carry no
     * fine — there is nothing to settle) and cancelled records (CTMO voided
     * them). Counting either would leave a driver who has paid everything
     * permanently below 100%, so the percentage answers "of the records that can
     * actually be paid for, how many are paid for".
     */
    const settleable = violations.filter(
      (v) => v.recordType !== "warning" && v.settlementStatus !== "cancelled"
    ).length;

    // Computed in RN but never rendered; kept so the arithmetic of this panel
    // stays readable next to the figures that do appear.
    const cancelled = violations.filter((v) => v.settlementStatus === "cancelled").length;

    const progressPct = settleable > 0 ? Math.round((settled / settleable) * 100) : 0;

    return { total, settled, unsettled, warnings, cancelled, progressPct };
  }, [violations]);

  const recentActivity = useMemo(
    () =>
      [...violations]
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
        .slice(0, RECENT_ACTIVITY_LIMIT),
    [violations]
  );

  return (
    <>
      <AppBar title="Violation Status" backHref="/home" />

      <PageBody>
        {isLoading ? (
          <div className="flex items-center justify-center pt-12">
            <LoaderCircle size={24} strokeWidth={2.2} className="animate-spin text-brand-500" aria-hidden />
            <span className="sr-only">Loading violation status</span>
          </div>
        ) : errorMessage ? (
          <NoticeBox tone="danger" className="mt-5 text-[13px]">
            {errorMessage}
          </NoticeBox>
        ) : (
          <>
            <section className="mt-4 rounded-[14px] bg-surface p-[18px]">
              <h2 className="mb-3.5 text-[14px] font-bold text-ink">Overview</h2>
              {/* RN's statsGrid was a 46%-wide wrap at a 12px gap — two per row. */}
              <div className="grid grid-cols-2 gap-3">
                <StatBox
                  Icon={ScrollText}
                  value={stats.total}
                  label="Total Violations"
                  tile="bg-info-soft text-signal-info"
                  figure="text-signal-info"
                />
                <StatBox
                  Icon={CircleCheckBig}
                  value={stats.settled}
                  label="Settled"
                  tile="bg-go-soft text-go-ink"
                  figure="text-go-ink"
                />
                <StatBox
                  Icon={TriangleAlert}
                  value={stats.unsettled}
                  label="Unsettled"
                  tile="bg-danger-soft text-signal-stop"
                  figure="text-signal-stop"
                />
                <StatBox
                  Icon={CircleDot}
                  value={stats.warnings}
                  label="Warnings"
                  tile="bg-warn-soft text-signal-hold"
                  figure="text-signal-hold"
                />
              </div>
            </section>

            <section className="mt-4 rounded-[14px] bg-surface p-[18px]">
              <h2 className="mb-3.5 text-[14px] font-bold text-ink">Settlement Progress</h2>

              <div className="flex items-baseline justify-between">
                <p className="text-[13px] text-muted">Settled</p>
                <p className="tabular font-display text-[14px] font-bold text-ink">
                  {stats.progressPct}%
                </p>
              </div>

              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={stats.progressPct}
                aria-label="Settlement progress"
                className="mt-2 h-2 overflow-hidden rounded-full bg-hairline"
              >
                <div
                  className="h-2 rounded-full bg-brand-500 transition-[width] duration-500 ease-out"
                  style={{ width: `${stats.progressPct}%` }}
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[10px] bg-go-soft p-3 text-center">
                  <p className="text-[12px] font-semibold text-go-ink">Settled</p>
                  <p className="tabular font-display text-[18px] font-bold text-go-ink">
                    {stats.settled}
                  </p>
                </div>
                <div className="rounded-[10px] bg-danger-soft p-3 text-center">
                  <p className="text-[12px] font-semibold text-signal-stop">Pending</p>
                  <p className="tabular font-display text-[18px] font-bold text-signal-stop">
                    {stats.unsettled}
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-4 rounded-[14px] bg-surface p-[18px]">
              <h2 className="mb-1 text-[14px] font-bold text-ink">Recent Activity</h2>

              {recentActivity.length === 0 ? (
                <p className="text-[13px] text-muted">No recent activity.</p>
              ) : (
                <ul>
                  {recentActivity.map((record) => (
                    <li
                      key={record.citationId}
                      className="flex gap-2.5 border-b border-hairline py-3.5 last:border-b-0"
                    >
                      <span
                        aria-hidden
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${
                          record.settlementStatus === "settled" ? "bg-go-ink" : "bg-signal-hold"
                        }`}
                      />

                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-ink">
                          {record.settlementStatus === "settled"
                            ? "Payment Received"
                            : "Citation Issued"}
                        </p>
                        <p className="mt-0.5 text-[12px] leading-snug text-muted">
                          {record.violations?.[0]?.violationType?.description || "Violation"} -{" "}
                          {record.placeOfViolation}
                        </p>
                        <p className="tabular mt-0.5 text-[11px] text-muted">
                          {formatShortDateManila(record.occurredAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </PageBody>

      <BottomNav />
    </>
  );
}

type StatBoxProps = {
  Icon: LucideIcon;
  value: number;
  label: string;
  /** Icon-tile fill and the figure colour, from the RN screen's hardcoded hexes. */
  tile: string;
  figure: string;
};

/**
 * RN's local StatBox: a tinted icon tile over a large coloured figure and a
 * small grey label. The emojis it carried (📄 ✅ ⚠️ 🔶) become the same lucide
 * set the violations screens already use.
 *
 * <StatsCard> was not reused here — it spreads exactly three figures across one
 * overlapping band card, and this panel is a 2x2 grid inside a plain card that
 * sits under an <AppBar>.
 */
function StatBox({ Icon, value, label, tile, figure }: StatBoxProps) {
  return (
    <div className="flex flex-col items-center">
      <span className={`grid size-10 place-items-center rounded-[10px] ${tile}`}>
        <Icon size={19} strokeWidth={2} aria-hidden />
      </span>
      <p className={`tabular font-display mt-1.5 text-[20px] font-bold ${figure}`}>{value}</p>
      <p className="mt-0.5 text-center text-[11px] text-muted">{label}</p>
    </div>
  );
}