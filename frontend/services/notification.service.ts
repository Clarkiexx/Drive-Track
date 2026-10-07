import api, { type ApiEnvelope } from "@/lib/axios";
import type { Role } from "@/constants/roles";

/**
 * Notification service — thin wrappers over
 * backend/src/routes/notificationRoutes.js.
 *
 * Driver and enforcer endpoints are NAMESPACED differently on the backend
 * (/notifications/mine vs /notifications/enforcer/mine, and /:id/read vs
 * /enforcer/:id/read), so pick the matching function for the signed-in role.
 * Broadcasts are admin-only. Returns the unwrapped `data` of the envelope.
 *
 * ROLE COVERAGE: every personal inbox route is `allowRoles('driver')` or
 * `allowRoles('enforcer')` — admins have NO personal notifications (only
 * POST /broadcast + GET /broadcasts). listForRole()/markAllReadForRole()
 * therefore short-circuit for admin instead of firing a guaranteed 403.
 */

/** backend/prisma/schema.prisma: enum NotificationType. */
export const NOTIFICATION_TYPES = [
  "citation_issued",
  "warning_issued",
  "payment_reminder",
  "settlement_confirmed",
  "follow_up",
  "announcement",
  "system_alert",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationRecord {
  notificationId: number;
  driverId?: number | null;
  enforcerId?: number | null;
  citationId?: number | null;
  broadcastId?: number | null;
  message: string;
  notificationType: NotificationType;
  status: "unread" | "read";
  createdAt: string;
}

export interface BroadcastPayload {
  recipientType:
    | "unsettled_drivers"
    | "all_drivers"
    | "all_enforcers"
    | "everyone"
    | "single_driver"
    | "single_enforcer";
  message: string;
  recipientId?: number;
  licenseNumber?: string;
  employeeId?: string;
  badgeNumber?: string;
}

export interface BroadcastRecord {
  broadcastId: number;
  adminId: number;
  recipientType: BroadcastPayload["recipientType"];
  recipientId?: number | null;
  message: string;
  recipientCount: number;
  createdAt: string;
}

export const notificationService = {
  /* ------------------------------------------------------- driver routes */

  /** GET /notifications/mine (driver) */
  listMine: async (): Promise<NotificationRecord[]> => {
    const res = await api.get<ApiEnvelope<NotificationRecord[]>>("/notifications/mine");
    return res.data?.data ?? [];
  },

  /** PATCH /notifications/:id/read (driver) */
  markRead: async (notificationId: number | string): Promise<void> => {
    await api.patch<ApiEnvelope<null>>(`/notifications/${notificationId}/read`);
  },

  /** PATCH /notifications/mark-all-read (driver) */
  markAllRead: async (): Promise<void> => {
    await api.patch<ApiEnvelope<null>>("/notifications/mark-all-read");
  },

  /* ----------------------------------------------------- enforcer routes */

  /** GET /notifications/enforcer/mine (enforcer) */
  listEnforcerMine: async (): Promise<NotificationRecord[]> => {
    const res = await api.get<ApiEnvelope<NotificationRecord[]>>("/notifications/enforcer/mine");
    return res.data?.data ?? [];
  },

  /** PATCH /notifications/enforcer/:id/read (enforcer) */
  markEnforcerRead: async (notificationId: number | string): Promise<void> => {
    await api.patch<ApiEnvelope<null>>(`/notifications/enforcer/${notificationId}/read`);
  },

  /** PATCH /notifications/enforcer/mark-all-read (enforcer) */
  markEnforcerAllRead: async (): Promise<void> => {
    await api.patch<ApiEnvelope<null>>("/notifications/enforcer/mark-all-read");
  },

  /**
   * Role-aware shortcut for the shared bell menu.
   * driver → /notifications/mine, enforcer → /notifications/enforcer/mine,
   * admin → [] (no admin inbox exists; see module doc).
   */
  listForRole: async (role: Role): Promise<NotificationRecord[]> => {
    if (role === "enforcer") return notificationService.listEnforcerMine();
    if (role === "admin") return [];
    return notificationService.listMine();
  },

  /**
   * Role-aware single "mark read", the counterpart to markAllReadForRole.
   * Lets one shared inbox mark a row without branching on the role itself.
   * admin is a no-op — there is no admin inbox to mark.
   */
  markReadForRole: async (role: Role, notificationId: number | string): Promise<void> => {
    if (role === "enforcer") return notificationService.markEnforcerRead(notificationId);
    if (role === "admin") return;
    return notificationService.markRead(notificationId);
  },

  /**
   * Role-aware "mark all read" for the shared bell menu.
   * admin throws locally — there is nothing to mark and the backend would 403.
   */
  markAllReadForRole: async (role: Role): Promise<void> => {
    if (role === "enforcer") return notificationService.markEnforcerAllRead();
    if (role === "admin") {
      throw new Error(
        "Admin accounts have no personal notification inbox — only drivers and " +
          "enforcers receive per-user notifications. Use listBroadcasts() for admin activity."
      );
    }
    return notificationService.markAllRead();
  },

  /* ------------------------------------------------------- admin routes */

  /**
   * POST /notifications/broadcast (admin) — the backend returns ONE broadcast
   * object (201), not an array, so it is wrapped to keep the array return type
   * consistent with listBroadcasts().
   */
  sendBroadcast: async (payload: BroadcastPayload): Promise<BroadcastRecord[]> => {
    const res = await api.post<ApiEnvelope<unknown>>("/notifications/broadcast", payload);
    const data = res.data?.data;
    if (Array.isArray(data)) return data as BroadcastRecord[];
    if (data && typeof data === "object") return [data as BroadcastRecord];
    return [];
  },

  /** GET /notifications/broadcasts (admin, latest 20) */
  listBroadcasts: async (): Promise<BroadcastRecord[]> => {
    const res = await api.get<ApiEnvelope<BroadcastRecord[]>>("/notifications/broadcasts");
    return res.data?.data ?? [];
  },
};
