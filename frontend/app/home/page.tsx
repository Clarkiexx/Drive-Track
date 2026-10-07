"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  ChartColumn,
  GraduationCap,
  LogOut,
  MessageCircleMore,
  RotateCw,
  ScrollText,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import MobileHeader from "@/components/common/MobileHeader";
import BottomNav from "@/components/common/BottomNav";
import StatusCard from "@/components/common/StatusCard";
import QuickAccessGrid, { type QuickAction } from "@/components/common/QuickAccessGrid";
import VerificationBanner from "@/components/common/VerificationBanner";
import { citationService, type CitationRecord } from "@/services/citation.service";
import {
  notificationService,
  type NotificationRecord,
} from "@/services/notification.service";

export default function DriverHomePage() {
  const { user, logout } = useAuth();

  const [violations, setViolations] = useState<CitationRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Mirrors HomeScreen's loadData: both lists in one round trip. Failures are
   * swallowed on purpose — this screen is a dashboard, so a dead backend should
   * read as "0" rather than replace the whole home with an error. `allSettled`
   * (rather than Promise.all) lets one dead endpoint still deliver the other.
   */
  const load = useCallback(async () => {
    const [violationsResult, notificationsResult] = await Promise.allSettled([
      citationService.listMyViolations(),
      // The driver inbox is /notifications/mine; listForRole picks the route
      // from the role, and this tree is already gated to drivers by RoleGate.
      notificationService.listForRole("driver"),
    ]);

    if (violationsResult.status === "fulfilled") setViolations(violationsResult.value);
    if (notificationsResult.status === "fulfilled") setNotifications(notificationsResult.value);
  }, []);

  /**
   * RN refreshed on every focus (useFocusEffect), so settling a violation or
   * reading notifications elsewhere was reflected the moment the driver
   * returned. The App Router has no focus hook, so window focus and tab
   * visibility stand in for it.
   */
  useEffect(() => {
    const refresh = () => {
      void load();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    // Deferred rather than called in the effect body: the bearer token only
    // exists in localStorage, so the first client render has to match the
    // server's (admin/dashboard/page.tsx sets the same precedent).
    const timer = window.setTimeout(refresh, 0);

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load]);

  // RN's RefreshControl: the same load, with a spinning icon so the tap is
  // acknowledged. globals.css deliberately disables native overscroll, which is
  // why this button carries the refresh affordance instead of a drag gesture.
  const handleRefresh = () => {
    setIsRefreshing(true);
    void load().finally(() => setIsRefreshing(false));
  };

  // Derived on read, never stored separately — the status card and the bell
  // badge then read from the same numbers and cannot disagree.
  const unsettledCount = useMemo(
    () => violations.filter((v) => v.settlementStatus === "pending").length,
    [violations]
  );
  const unreadCount = useMemo(
    () => notifications.filter((n) => n.status === "unread").length,
    [notifications]
  );

  const quickActions = useMemo<QuickAction[]>(
    () => [
      { label: "My Violations", href: "/home/violations", Icon: ScrollText, tone: "danger" },
      { label: "Violation Status", href: "/home/status", Icon: ChartColumn, tone: "info" },
      {
        label: "Notifications",
        href: "/home/notifications",
        Icon: Bell,
        tone: "warn",
        badge: unreadCount,
      },
      { label: "AI Chatbot", href: "/home/chat", Icon: MessageCircleMore, tone: "brand" },
      { label: "Learning Center", href: "/home/learning", Icon: GraduationCap, tone: "ember" },
    ],
    [unreadCount]
  );

  return (
    <>
      <MobileHeader
        eyebrow="Welcome back"
        title={user ? `${user.firstName} ${user.lastName}` : "Driver"}
        status={<VerificationBanner status={user?.verificationStatus} />}
        actions={
          <>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh status and notifications"
              className="grid size-9 place-items-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-70"
            >
              <RotateCw
                size={17}
                strokeWidth={2.2}
                className={isRefreshing ? "animate-spin" : undefined}
                aria-hidden
              />
            </button>

            {/* RN put a red dot on the bell; the count says how far behind the
                driver is, which a bare dot cannot. Capped so it never grows
                over the icon. */}
            <Link
              href="/home/notifications"
              aria-label={
                unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
              }
              className="relative grid size-9 place-items-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white"
            >
              <Bell size={17} strokeWidth={2.1} aria-hidden />
              {unreadCount > 0 ? (
                <span className="tabular absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-signal-stop px-1 text-[10px] leading-4 font-bold text-white ring-2 ring-brand-700">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Link>

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

      <StatusCard
        label="Current Status"
        value={
          unsettledCount > 0
            ? `${unsettledCount} Unsettled Violation${unsettledCount > 1 ? "s" : ""}`
            : "All Clear"
        }
        tone={unsettledCount > 0 ? "attention" : "clear"}
        notice={
          unsettledCount > 0
            ? "You have pending violations. Please settle to avoid penalties."
            : undefined
        }
      />

      {/* Sits outside <PageBody> because the grid supplies its own 14px gutter
          (RN's paddingHorizontal: 14) while the heading sits at 20px; stacking
          PageBody's 20px on top would misalign the two. pb-nav is passed here
          so the last row still clears the fixed tab bar. */}
      <QuickAccessGrid title="Quick Access" actions={quickActions} className="pb-nav" />

      <BottomNav />
    </>
  );
}