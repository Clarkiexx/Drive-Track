"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Megaphone, TriangleAlert, type LucideIcon } from "lucide-react";

import AppBar from "@/components/common/AppBar";
import BottomNav from "@/components/common/BottomNav";
import EmptyState from "@/components/common/EmptyState";
import NoticeBox from "@/components/common/NoticeBox";
import PageBody from "@/components/common/PageBody";
import { formatShortDate } from "@/components/common/dates";
import { useAuth } from "@/context/AuthContext";
import { getApiErrorMessage } from "@/lib/axios";
import {
  notificationService,
  type NotificationRecord,
  type NotificationType,
} from "@/services/notification.service";

/**
 * Enforcer notification inbox — the web port of
 * enforcer-app/src/screens/NotificationsScreen.js.
 *
 * The screen is ~95% identical to the driver one at /home/notifications (header,
 * unread counter with "Mark all as read", flat cards with a tinted icon tile and
 * an unread dot, loading / empty / error states), and those parts are ported
 * identically. What the enforcer original does NOT do, and this port therefore
 * does not do either:
 *
 *   - it never deep-links. handleTapNotification has no navigation call, so a
 *     citationId on an enforcer notification does nothing here — tapping only
 *     marks the row read. (The driver screen does navigate to ViolationDetail.)
 *   - it has no useFocusEffect, so it only loaded on mount. This port adds the
 *     same focus/visibility refresh the driver screen gets, because the enforcer
 *     inbox carries admin broadcasts that land while an officer is in the field.
 *
 * Its icon table is three entries rather than seven, and anything it did not
 * name fell back to the megaphone — both kept as they were.
 */

type NotificationIcon = {
  Icon: LucideIcon;
  /** Icon-tile fill + ink, matching the RN iconBox background colours. */
  className: string;
};

/**
 * `|| TYPE_ICON.announcement` in the RN file: the megaphone and its #E7F0FE
 * tile (info-soft) draw every type the table below does not name.
 */
const FALLBACK_ICON: NotificationIcon = {
  Icon: Megaphone,
  className: "bg-info-soft text-signal-info",
};

/**
 * The RN TYPE_ICON table for the enforcer inbox, entry for entry: 📢 → Megaphone
 * on #E7F0FE, ⚠️ → TriangleAlert on #FDECEC, 🔔 → Bell on #FEF3C7. Those three
 * hexes are exactly info-soft, danger-soft and warn-soft in app/globals.css.
 * Partial because the enforcer screen named three of the seven Prisma types and
 * left the rest to the fallback.
 */
const TYPE_ICON: Partial<Record<NotificationType, NotificationIcon>> = {
  announcement: FALLBACK_ICON,
  system_alert: { Icon: TriangleAlert, className: "bg-danger-soft text-signal-stop" },
  follow_up: { Icon: Bell, className: "bg-warn-soft text-signal-hold" },
};

/** How many card-shaped skeletons stand in for the inbox while it loads. */
const SKELETON_ROWS = 3;

/** Entrance stagger per row, capped so a long inbox never crawls in. */
const ROW_STAGGER_MS = 45;
const STAGGER_CAP = 8;

export default function EnforcerNotificationsPage() {
  // RoleGate has already proved this is an enforcer, so the fallback only exists
  // to satisfy the Role argument on the service helpers.
  const { user } = useAuth();
  const role = user?.role ?? "enforcer";

  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      setNotifications(await notificationService.listForRole(role));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Unable to load notifications."));
    } finally {
      setIsLoading(false);
    }
  }, [role]);

  useEffect(() => {
    // Deferred rather than run in the effect body: the token only exists in the
    // browser, and this keeps the first render identical on both sides.
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  /**
   * Stands in for React Navigation's useFocusEffect, which the App Router has no
   * equivalent of — coming back to this screen does not remount it. Same
   * treatment as app/home/violations/page.tsx.
   */
  useEffect(() => {
    const onFocus = () => void load();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load]);

  const unreadCount = notifications.filter((row) => row.status === "unread").length;

  // The RN enforcer screen's handleTapNotification: mark read, nothing else. It
  // never navigated to a citation, so neither does this.
  async function handleOpen(notification: NotificationRecord) {
    setActionError("");

    if (notification.status !== "unread") return;

    // Optimistic, as in the RN screen: flip the row now, tell the backend after.
    // The state write there happened only on success because the catch was empty,
    // which made a failure indistinguishable from a success.
    setNotifications((prev) =>
      prev.map((row) =>
        row.notificationId === notification.notificationId ? { ...row, status: "read" } : row
      )
    );

    try {
      await notificationService.markEnforcerRead(notification.notificationId);
    } catch (error) {
      setNotifications((prev) =>
        prev.map((row) =>
          row.notificationId === notification.notificationId ? { ...row, status: "unread" } : row
        )
      );
      setActionError(getApiErrorMessage(error, "Could not mark that notification as read."));
    }
  }

  async function handleMarkAllRead() {
    if (isMarkingAll) return;
    setActionError("");
    setIsMarkingAll(true);

    const previous = notifications;
    setNotifications((prev) => prev.map((row) => ({ ...row, status: "read" })));

    try {
      await notificationService.markAllReadForRole(role);
    } catch (error) {
      setNotifications(previous);
      setActionError(getApiErrorMessage(error, "Could not mark every notification as read."));
    } finally {
      setIsMarkingAll(false);
    }
  }

  // A failed load only takes over the screen when there is nothing to show; a
  // failed background refresh leaves the rows already on screen and reports
  // itself above them, so the officer never loses what they were reading.
  const bannerError = actionError || (notifications.length > 0 ? errorMessage : "");

  return (
    <>
      <AppBar title="Notifications" backHref="/enforcer" />

      <PageBody bleed>
        {/* The RN subHeader: white strip, unread count left, bulk action right. */}
        <div className="flex items-center justify-between gap-3 bg-surface px-5 py-3">
          <p aria-live="polite" className="text-[12px] text-muted">
            <span className="tabular">{unreadCount}</span> Unread
          </p>

          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              disabled={isMarkingAll}
              aria-busy={isMarkingAll}
              className="text-[12px] font-semibold text-brand-500 underline-offset-2 hover:underline disabled:opacity-60"
            >
              Mark all as read
            </button>
          ) : null}
        </div>

        {bannerError ? (
          <div role="alert" className="px-5 pt-4">
            <NoticeBox tone="danger" className="text-[13px]">
              {bannerError}
            </NoticeBox>
          </div>
        ) : null}

        {isLoading && notifications.length === 0 ? (
          <SkeletonList />
        ) : notifications.length === 0 ? (
          errorMessage ? (
            <div className="px-5 pt-4">
              <NoticeBox tone="danger" className="text-[13px]">
                {errorMessage}
              </NoticeBox>
            </div>
          ) : (
            <EmptyState title="No notifications yet.">
              Admin memos will appear here.
            </EmptyState>
          )
        ) : (
          <ul className="px-5 pt-4">
            {notifications.map((notification, index) => (
              <NotificationRow
                key={notification.notificationId}
                notification={notification}
                icon={TYPE_ICON[notification.notificationType] ?? FALLBACK_ICON}
                index={index}
                onOpen={handleOpen}
              />
            ))}
          </ul>
        )}
      </PageBody>

      <BottomNav />
    </>
  );
}

type NotificationRowProps = {
  notification: NotificationRecord;
  icon: NotificationIcon;
  index: number;
  onOpen: (notification: NotificationRecord) => void;
};

/** One inbox card: tinted icon tile, message, date, and the unread dot. */
function NotificationRow({ notification, icon, index, onOpen }: NotificationRowProps) {
  const { Icon, className } = icon;
  const isUnread = notification.status === "unread";

  return (
    <li
      className="rise-sm"
      style={{ animationDelay: `${Math.min(index, STAGGER_CAP) * ROW_STAGGER_MS}ms` }}
    >
      <button
        type="button"
        onClick={() => void onOpen(notification)}
        className="mb-2.5 flex w-full items-start gap-3 rounded-xl border-l-[3px] border-l-brand-500 bg-surface p-3.5 text-left transition-colors duration-150 hover:bg-surface-sunken active:bg-surface-sunken"
      >
        <span className={`grid size-[34px] shrink-0 place-items-center rounded-lg ${className}`}>
          <Icon size={17} strokeWidth={2.2} aria-hidden />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-[18px] text-ink">
            {notification.message}
          </span>
          <span className="mt-1.5 block text-[11px] text-muted">
            {formatShortDate(notification.createdAt)}
          </span>
        </span>

        {isUnread ? (
          <>
            {/* A coloured dot on its own is colour-only, so the state is also
                spelled out for assistive tech inside the row's name. */}
            <span aria-hidden className="mt-1 size-2 shrink-0 rounded-full bg-brand-500" />
            <span className="sr-only">Unread</span>
          </>
        ) : null}
      </button>
    </li>
  );
}

/** Card-shaped placeholders, one per row the inbox is about to render. */
function SkeletonList() {
  return (
    <ul aria-hidden className="px-5 pt-4">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <li
          key={index}
          className="mb-2.5 flex items-start gap-3 rounded-xl border border-hairline bg-surface p-3.5"
        >
          <div
            className="breathe size-[34px] shrink-0 rounded-lg bg-surface-sunken"
            style={index > 0 ? { animationDelay: `${index * 110}ms` } : undefined}
          />
          <div className="min-w-0 flex-1">
            <div className="breathe h-3 w-full rounded-full bg-surface-sunken" />
            <div
              className="breathe mt-2 h-2.5 w-24 rounded-full bg-surface-sunken"
              style={index > 0 ? { animationDelay: `${index * 110 + 90}ms` } : undefined}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
