import api, { type ApiEnvelope } from "@/lib/axios";

/**
 * Audit-log service — thin wrapper over backend/src/routes/auditLogRoutes.js
 * (GET /audit-logs, admin-only, read-only by design: the backend exposes no
 * write routes for this resource). Returns the unwrapped `data` of the
 * envelope; failures reject with an AxiosError (getApiErrorMessage() reads
 * the backend `message`).
 */

export interface AuditLogAdmin {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}

export interface AuditLogRecord {
  auditLogId: number;
  adminId: number;
  action: string;
  targetType: string;
  targetId?: number | null;
  details?: string | null;
  createdAt: string;
  admin?: AuditLogAdmin | null;
}

export interface AuditLogPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const auditLogService = {
  /**
   * GET /audit-logs — paginated, newest first. Backend answers
   * `{ logs, pagination }` with each row's admin joined under `admin`.
   */
  listAuditLogs: async (
    params: { page?: number; limit?: number } = {}
  ): Promise<{ logs: AuditLogRecord[]; pagination: AuditLogPagination }> => {
    const res = await api.get<
      ApiEnvelope<{ logs?: AuditLogRecord[]; pagination?: AuditLogPagination }>
    >("/audit-logs", { params });
    const data = res.data?.data;
    return {
      logs: Array.isArray(data?.logs) ? data.logs : [],
      pagination: {
        page: Number(data?.pagination?.page) || Number(params.page) || 1,
        limit: Number(data?.pagination?.limit) || Number(params.limit) || 25,
        total: Number(data?.pagination?.total) || 0,
        totalPages: Number(data?.pagination?.totalPages) || 0,
      },
    };
  },
};
