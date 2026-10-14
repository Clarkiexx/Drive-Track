"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, LogOut, MapPin, ShieldCheck } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import AppBar from "@/components/common/AppBar";
import BottomNav from "@/components/common/BottomNav";
import NoticeBox from "@/components/common/NoticeBox";
import PageBody from "@/components/common/PageBody";
import useFocusRefresh from "@/components/common/useFocusRefresh";
import { getApiErrorMessage } from "@/lib/axios";
import { citationService } from "@/services/citation.service";

/**
 * Enforcer profile — the web port of
 * enforcer-app/src/screens/ProfileScreen.js: avatar initials, officer name
 * and badge, badge/station rows from the login session, performance stats
 * derived from the officer's own citations, and sign-out.
 *
 * Identity comes from the stored session (auth.service retains badgeNumber
 * and station from POST /auth/enforcer/login) because GET /enforcers/:id is
 * admin-only — there is no endpoint for an officer to re-fetch their record.
 * Stats come from citationService.listMyCitations(), the same request the
 * home screen already makes, so no new backend surface is involved.
 */
export default function EnforcerProfilePage() {
  const { user, logout } = useAuth();

  const [total, setTotal] = useState(0);
  const [thisMonth, setThisMonth] = useState(0);
  const [settledRate, setSettledRate] = useState(0);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const firstName = user?.firstName ?? "";
  const lastName = user?.lastName ?? "";
  const badgeNumber = user?.badgeNumber ?? null;
  const station = user?.station ?? null;

  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  const loadStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const citations = await citationService.listMyCitations();
      const now = new Date();
      const monthCount = citations.filter((citation) => {
        const occurred = new Date(citation.occurredAt);
        return (
          occurred.getFullYear() === now.getFullYear() && occurred.getMonth() === now.getMonth()
        );
      }).length;
      // Warnings carry no fine, so they are outside the settled rate —
      // the same denominator the driver status screen uses.
      const settleable = citations.filter((citation) => citation.recordType !== "warning");
      const settled = settleable.filter(
        (citation) => citation.settlementStatus === "settled"
      ).length;
      setTotal(citations.length);
      setThisMonth(monthCount);
      setSettledRate(settleable.length > 0 ? Math.round((settled / settleable.length) * 100) : 0);
    } catch {
      // Non-critical — the stats simply stay zeroed, exactly as the RN
      // screen leaves them when its fetch fails.
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadStats(), 0);
    return () => window.clearTimeout(timer);
  }, [loadStats]);

  useFocusRefresh(loadStats);

  return (
    <>
      <AppBar title="My Profile" backHref="/enforcer" />

      <PageBody>
        <div className="flex flex-col items-center pt-6">
          <span className="grid size-[72px] place-items-center rounded-full bg-brand-500 font-display text-[24px] font-bold text-white ring-[3px] ring-surface">
            {initials}
          </span>

          <p className="font-display mt-2.5 text-center text-[17px] font-bold text-ink">
            {user ? `Officer ${firstName} ${lastName}` : "Officer"}
          </p>
          <p className="mt-1 text-center text-[13px] text-muted">
            {badgeNumber ? `Badge #${badgeNumber}` : "No badge number on file"}
          </p>
        </div>

        <section className="mt-6 flex flex-col gap-3 rounded-[14px] bg-surface p-[18px]">
          <InfoRow Icon={ShieldCheck} label="Badge Number" value={badgeNumber || "—"} />
          <InfoRow Icon={MapPin} label="Station" value={station || "—"} />
        </section>

        <section className="mt-4 rounded-[14px] bg-surface p-[18px]">
          <h2 className="text-[14px] font-bold text-ink">🏅 Performance Stats</h2>
          {isLoadingStats ? (
            <div className="flex items-center justify-center gap-2 py-4" role="status">
              <LoaderCircle size={18} strokeWidth={2.4} className="animate-spin text-brand-500" aria-hidden />
              <span className="sr-only">Loading performance stats</span>
            </div>
          ) : (
            <div className="mt-3 flex">
              <StatBox value={String(total)} label="Total Citations" figure="text-signal-info" />
              <StatBox value={String(thisMonth)} label="This Month" figure="text-go-ink" />
              <StatBox value={`${settledRate}%`} label="Settled Rate" figure="text-signal-violet" />
            </div>
          )}
        </section>

        <NoticeBox tone="info" className="mt-4 text-[12px]">
          Account changes (station, status, password) are managed by your CTMO
          administrator.
        </NoticeBox>

        <button
          type="button"
          onClick={logout}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[10px] bg-signal-stop py-[13px] text-[14px] font-semibold text-white transition-colors hover:bg-signal-stop/90"
        >
          <LogOut size={16} strokeWidth={2.2} aria-hidden />
          Logout
        </button>
      </PageBody>

      <BottomNav />
    </>
  );
}

function InfoRow({
  Icon,
  label,
  value,
}: {
  Icon: typeof ShieldCheck;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-sunken text-muted">
        <Icon size={17} strokeWidth={2} aria-hidden />
      </span>

      <div className="min-w-0">
        <p className="text-[11px] leading-none text-muted">{label}</p>
        <p className="mt-1 text-[14px] font-semibold break-words text-ink">{value}</p>
      </div>
    </div>
  );
}

function StatBox({ value, label, figure }: { value: string; label: string; figure: string }) {
  return (
    <div className="flex flex-1 flex-col items-center">
      <p className={`tabular font-display text-[22px] font-bold ${figure}`}>{value}</p>
      <p className="mt-1 text-center text-[11px] text-muted">{label}</p>
    </div>
  );
}
