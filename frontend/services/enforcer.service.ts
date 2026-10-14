import api, { type ApiEnvelope, unwrapList } from "@/lib/axios";

/**
 * Enforcer service — thin wrappers over backend/src/routes/enforcerRoutes.js
 * (every route is admin-only). Returns the unwrapped `data` of the backend
 * envelope; failures reject with an AxiosError (getApiErrorMessage()).
 */

export const ENFORCER_STATUSES = ["active", "on_leave", "suspended", "archived"] as const;
export type EnforcerStatus = (typeof ENFORCER_STATUSES)[number];

export interface EnforcerRecord {
  enforcerId: number;
  firstName: string;
  lastName: string;
  employeeId: string;
  username?: string;
  badgeNumber?: string | null;
  station?: string | null;
  address?: string | null;
  contactNumber?: string | null;
  status?: EnforcerStatus;
  /** Added by GET /enforcers list (bulk-counted per page, not stored). */
  citationsIssued?: number;
}

export interface EnforcerListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: EnforcerStatus | "";
  includeArchived?: boolean | string;
}

export interface EnforcerPayload {
  firstName: string;
  lastName: string;
  employeeId: string;
  badgeNumber?: string;
  station?: string;
  address?: string;
  contactNumber?: string;
}

export const enforcerService = {
  /**
   * GET /enforcers — admin list (?search=&status=&includeArchived=).
   * Backend answers { enforcers, pagination } (NOT a bare array) — unwrapList
   * keeps this a plain array.
   */
  listEnforcers: async (params: EnforcerListParams = {}): Promise<EnforcerRecord[]> => {
    const res = await api.get<ApiEnvelope<unknown>>("/enforcers", { params });
    return unwrapList<EnforcerRecord>(res.data?.data, "enforcers");
  },

  /**
   * GET /enforcers — paged variant for the admin Enforcers register.
   * Same endpoint as listEnforcers, but preserves the backend's
   * `{ enforcers, pagination }` shape so the table can page. listEnforcers
   * is left untouched for existing callers.
   */
  listEnforcersPage: async (
    params: EnforcerListParams = {}
  ): Promise<{ enforcers: EnforcerRecord[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
    const res = await api.get<ApiEnvelope<unknown>>("/enforcers", { params });
    const data = res.data?.data as
      | { enforcers?: EnforcerRecord[]; pagination?: { page: number; limit: number; total: number; totalPages: number } }
      | undefined;
    return {
      enforcers: Array.isArray(data?.enforcers) ? data.enforcers : [],
      pagination: {
        page: Number(data?.pagination?.page) || Number(params.page) || 1,
        limit: Number(data?.pagination?.limit) || Number(params.limit) || 10,
        total: Number(data?.pagination?.total) || 0,
        totalPages: Number(data?.pagination?.totalPages) || 0,
      },
    };
  },

  /** GET /enforcers/:id */
  getEnforcer: async (enforcerId: number | string): Promise<EnforcerRecord> => {
    const res = await api.get<ApiEnvelope<EnforcerRecord>>(`/enforcers/${enforcerId}`);
    if (!res.data?.data) throw new Error("Malformed enforcer response");
    return res.data.data;
  },

  /** POST /enforcers — username/temporary password are generated server-side. */
  createEnforcer: async (payload: EnforcerPayload): Promise<EnforcerRecord> => {
    const res = await api.post<ApiEnvelope<EnforcerRecord>>("/enforcers", payload);
    if (!res.data?.data) throw new Error("Malformed enforcer response");
    return res.data.data;
  },

  /** PATCH /enforcers/:id — partial profile update. */
  updateEnforcer: async (
    enforcerId: number | string,
    payload: Partial<EnforcerPayload>
  ): Promise<EnforcerRecord> => {
    const res = await api.patch<ApiEnvelope<EnforcerRecord>>(`/enforcers/${enforcerId}`, payload);
    if (!res.data?.data) throw new Error("Malformed enforcer response");
    return res.data.data;
  },

  /** PATCH /enforcers/:id/status — { status: EnforcerStatus }. */
  updateEnforcerStatus: async (
    enforcerId: number | string,
    status: EnforcerStatus
  ): Promise<{ enforcerId: number; status: EnforcerStatus }> => {
    const res = await api.patch<ApiEnvelope<{ enforcerId: number; status: EnforcerStatus }>>(
      `/enforcers/${enforcerId}/status`,
      { status }
    );
    if (!res.data?.data) throw new Error("Malformed enforcer response");
    return res.data.data;
  },

  /** PATCH /enforcers/:id/reset-password — returns a one-time temporary password. */
  resetPassword: async (
    enforcerId: number | string
  ): Promise<{ enforcerId: number; username: string; temporaryPassword: string }> => {
    const res = await api.patch<
      ApiEnvelope<{ enforcerId: number; username: string; temporaryPassword: string }>
    >(`/enforcers/${enforcerId}/reset-password`);
    if (!res.data?.data) throw new Error("Malformed enforcer response");
    return res.data.data;
  },

  /**
   * DELETE /enforcers/:id — NOT CALLABLE. The route exists but
   * enforcerController.deleteEnforcer unconditionally answers
   * 405 "Enforcers cannot be deleted. Historical records are retained".
   * Fails locally so no request (and no confusing 405 toast) is ever made.
   */
  deleteEnforcer: async (enforcerId: number | string): Promise<never> => {
    throw new Error(
      `Enforcer #${enforcerId} cannot be deleted — the backend always answers 405 ` +
        `(records are retained for enforcement history). Use updateEnforcerStatus() ` +
        `with "archived" or "suspended" instead.`
    );
  },
};
