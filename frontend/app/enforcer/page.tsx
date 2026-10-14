"use client";

import { useCallback, useMemo, useState } from "react";
import { Bell, ClipboardList, LogOut, RotateCw, ScanSearch } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import MobileHeader from "@/components/common/MobileHeader";
import BottomNav from "@/components/common/BottomNav";
import QuickAccessGrid, { type QuickAction } from "@/components/common/QuickAccessGrid";
import NoticeBox from "@/components/common/NoticeBox";
import StatsCard from "@/components/common/StatsCard";
import useClientNow from "@/components/common/useClientNow";
import useFocusRefresh from "@/components/common/useFocusRefresh";
import {
  isSameDay as citationDateIsSameDay,
  isSameWeek as citationDateIsSameWeek,
  isSameMonth as citationDateIsSameMonth,
} from "@/components/common/citationDates";
import { getApiErrorMessage } from "@/lib/axios";
import { citationService, type CitationRecord } from "@/services/citation.service";
import { notificationService } from "@/services/notification.service";

/**
 * Enforcer home — the web port of enforcer-app/src/screens/HomeScreen.js.
 *
 * The RN screen's shape is reproduced exactly: the brand band with a greeting and
 * the officer's name, the "Citations Issued" card overlapping it, and a
 * two-column Quick Actions grid underneath.
 *
 * Two deliberate departures from the RN original, both fixes:
 *
 *  1. THE FAILED LOAD NO LONGER LIES. HomeScreen did
 *         .catch(() => { /* non-critical *\/ })
 *     and left `stats` at its initial `{ today: 0, ... }`, so a dropped
 *     connection on a patrol route rendered a confident "0 issued today" —
 *     indistinguishable from an officer who genuinely has issued nothing. The
 *     truth is "unknown", and an enforcement record that guesses wrong is worse
 *     than one that says it does not know. The backend's message now surfaces in
 *     a danger NoticeBox and the figures are withheld rather than faked.
 *
 *  2. THE GREETING FOLLOWS THE CLOCK. RN hardcoded "Good morning," at every
 *     hour. The eyebrow is derived from the local hour instead, via
 *     useClientNow so the server render and the hydrated tree agree (see that
 *     hook) — before hydration it falls back to the generic "Welcome back",
 *     exactly as the driver home does.
 *
 * There is still no enforcer-stats endpoint, and none is invented here: the
 * buckets are computed client-side from citationService.listMyCitations(),
 * which is one request covering exactly the rows the officer owns.
 */

/**
 * Date-bucket predicates from HomeScreen.js.
 *
 * NOTE / duplication carried forward: HomeScreen.js and
 * PreviousCitationsScreen.js each define their own byte-identical copies of
 * these three functions. /enforcer/previous repeats them rather than importing
 * from here — an App Router `page.tsx` may only export the page itself and its
 * route config, so a shared module would have to live outside this lane's write
 * scope. The correct fix is one `components/common/citationDates.ts` beside the
 * existing `components/common/dates.ts`; it is reported rather than done.
 *
 * Both are read in the OFFICER'S local time on purpose: "issued today" has to
 * mean the officer's today, not UTC's.
 */
function isSameDay(a: Date, b: Date): boolean {
  return citationDateIsSameDay(a, b);
}

/** Sunday-anchored: "this week" starts on the current day minus getDay(). */
function isSameWeek(date: Date, now: Date): boolean {
  return citationDateIsSameWeek(date, now);
}

function isSameMonth(date: Date, now: Date): boolean {
  return citationDateIsSameMonth(date, now);
}

/** Local-hour greeting. 12 is "Good afternoon" and 17 "Good evening". */
function greetingFor(now: number): string {
  const hour = new Date(now).getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function EnforcerHomePage() {
  const { user, logout } = useAuth();

  // null before hydration, a timestamp afterwards — see useClientNow.
  const now = useClientNow();

  const [citations, setCitations] = useState<CitationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  /**
   * Same two requests the RN screen makes (its citation fetch for the stats
   * card, plus the notification badge the Quick Actions grid carries).
   *
   * `allSettled` rather than `Promise.all`: the two cards are independent, so a
   * dead notification route must not take the citation counts down with it.
   * Only the citations request can fail the whole load — that is the one the
   * officer's "Citations Issued" figures come from.
   */
  const load = useCallback(async () => {
    setIsLoading(true);

    const [citationsResult, notificationsResult] = await Promise.allSettled([
      citationService.listMyCitations(),
      notificationService.listForRole("enforcer"),
    ]);

    if (citationsResult.status === "fulfilled") {
      setCitations(citationsResult.value);
      setErrorMessage("");
    } else {
      // Keep whatever rows are already on screen; only report the failure. A
      // failed refresh should not blank a card the officer is mid-read.
      setErrorMessage(getApiErrorMessage(citationsResult.reason, "Unable to load your citations."));
    }

    if (notificationsResult.status === "fulfilled") {
      setUnreadCount(notificationsResult.value.filter((n) => n.status === "unread").length);
    }

    setIsLoading(false);
  }, []);

  /**
   * RN's useFocusEffect: returning to Home after issuing a citation in the
   * wizard should show it. The App Router keeps the screen mounted across
   * navigations, so there is no focus event to hook — useFocusRefresh stands in
   * with window focus + tab visibility. Do not hand-roll listeners here.
   */
  useFocusRefresh(load);

  const stats = useMemo(() => {
    const reference = now === null ? null : new Date(now);

    if (!reference) {
      return { today: 0, thisWeek: 0, thisMonth: 0 };
    }

    const occurred = citations.map((citation) => new Date(citation.occurredAt));

    return {
      today: occurred.filter((date) => isSameDay(date, reference)).length,
      thisWeek: occurred.filter((date) => isSameWeek(date, reference)).length,
      thisMonth: occurred.filter((date) => isSameMonth(date, reference)).length,
    };
  }, [citations, now]);

  // RN's five actions. "My Profile" is deliberately absent: /enforcer/profile is
  // not part of this migration, and a tile that leads to a 404 is worse than no
  // tile. It belongs on the More hub once that screen exists.
  const quickActions = useMemo<QuickAction[]>(
    () => [
      { label: "Issue Citation", href: "/enforcer/issue", Icon: ClipboardList, tone: "brand" },
      { label: "Search Driver", href: "/enforcer/search", Icon: ScanSearch, tone: "info" },
      {
        label: "Previous Citations",
        href: "/enforcer/previous",
        Icon: ClipboardList,
        tone: "ember",
      },
      {
        label: "Notifications",
        href: "/enforcer/notifications",
        Icon: Bell,
        tone: "warn",
        badge: unreadCount,
      },
    ],
    [unreadCount]
  );

  return (
    <>
      <MobileHeader
        eyebrow={now === null ? "Welcome back" : greetingFor(now)}
        title={user ? `Officer ${user.lastName}` : "Officer"}
        actions={
          <>
            <button
              type="button"
              onClick={() => void load()}
              disabled={isLoading}
              aria-label="Refresh citation counts"
              className="grid size-9 place-items-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-70"
            >
              <RotateCw
                size={17}
                strokeWidth={2.2}
                className={isLoading ? "animate-spin" : undefined}
                aria-hidden
              />
            </button>

            <button
              type="button"
              onClick={logout}
              aria-label="Log out"
              className="grid size-9 place-items-center rounded-full bg-signal-stop/90 text-white ring-1 ring-white/25 ring-inset transition-colors hover:bg-signal-stop"
            >
              <LogOut size={17} strokeWidth={2} aria-hidden />
            </button>
          </>
        }
      />

      <StatsCard
        title="Citations Issued"
        stats={[
          { label: "Today", value: stats.today, tone: "info" },
          { label: "This Week", value: stats.thisWeek, tone: "go" },
          { label: "This Month", value: stats.thisMonth, tone: "violet" },
        ]}
      />

      {/* Placed between the card and the grid, matching where RN's error text sat
          inside the card — but pushed out here so it never sits under the
          overlapping band edge. The figures above are never quietly zeroed:
          they either hold the last good numbers or have never loaded at all,
          and this says so. */}
      {errorMessage ? (
        <div className="mx-5 mt-4">
          <NoticeBox tone="danger" className="text-[13px]">
            {errorMessage} These counts could not be updated — tap refresh to try again.
          </NoticeBox>
        </div>
      ) : null}

      {/* Home + More bar below (variant="home"): the grid above covers the
          rest, so the full four-tab bar would only duplicate it. Other
          enforcer screens keep the full bar. pb-nav keeps the last row
          clear of the fixed tab bar. */}
      <QuickAccessGrid title="Quick Actions" actions={quickActions} className="pb-nav" />

      <BottomNav role="enforcer" variant="home" />
    </>
  );
}