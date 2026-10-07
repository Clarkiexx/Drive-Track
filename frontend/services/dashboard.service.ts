import api, { type ApiEnvelope } from "@/lib/axios";

/**
 * Dashboard service — thin wrappers over backend/src/routes/dashboardRoutes.js
 * (all three routes are admin-only: `authenticate, allowRoles('admin')`).
 * Returns the unwrapped `data` of the backend envelope.
 */

export interface DashboardSummary {
  totalDrivers: number;
  totalEnforcers: number;
  totalViolations: number;
  unsettledViolations: number;
  unsettledAmount: number;
}

export interface DashboardTrendPoint {
  date: string; // YYYY-MM-DD
  settled: number;
  unsettled: number;
}

export interface RecentActivityItem {
  type: "citation_issued" | "warning_issued";
  description: string;
  timestamp: string;
}

export const dashboardService = {
  /** GET /dashboard/summary */
  getSummary: async (): Promise<DashboardSummary> => {
    const res = await api.get<ApiEnvelope<DashboardSummary>>("/dashboard/summary");
    if (!res.data?.data) throw new Error("Malformed dashboard response");
    return res.data.data;
  },

  /** GET /dashboard/trend — last 7 days, settled vs unsettled per day. */
  getTrend: async (): Promise<DashboardTrendPoint[]> => {
    const res = await api.get<ApiEnvelope<DashboardTrendPoint[]>>("/dashboard/trend");
    return res.data?.data ?? [];
  },

  /** GET /dashboard/recent-activity — latest 5 issued citations/warnings. */
  getRecentActivity: async (): Promise<RecentActivityItem[]> => {
    const res = await api.get<ApiEnvelope<RecentActivityItem[]>>("/dashboard/recent-activity");
    return res.data?.data ?? [];
  },
};
