import api, { type ApiEnvelope, unwrapList } from "@/lib/axios";
import type { RecordType, SettlementStatus, PaymentMethod } from "@/constants/violations";

/**
 * Citation service — thin wrappers over backend/src/routes/citationRoutes.js
 * (+ the citation routes mounted on /drivers). Returns the unwrapped `data`
 * of the backend envelope; failures reject with an AxiosError
 * (getApiErrorMessage() reads the backend `message`).
 */

/** Violation types resolved on a citation (backend citationInclude.violations). */
export interface CitationViolationEntry {
  /** Prisma's primary key for the join row — plain `id`, not a namespaced key. */
  id?: number;
  penaltyAtIssuance?: string | number | null;
  violationType?: {
    violationTypeId?: number;
    articleSection?: string | null;
    description?: string | null;
  } | null;
  /**
   * Per-violation settlement state for partial payments. Each violation can be
   * paid off on its own, so these are resolved per join row rather than from
   * the citation header. Absent on legacy citations that settled as a whole.
   */
  settlementStatus?: SettlementStatus | null;
  settledAt?: string | null;
  paymentMethod?: PaymentMethod | null;
  paymentReference?: string | null;
}

/** Photo evidence row (backend citationInclude.evidence). */
export interface CitationEvidence {
  evidenceId?: number;
  imagePath?: string | null;
}

/** Summary enforcers returned with every citation. */
export interface CitationEnforcer {
  enforcerId: number;
  firstName: string;
  lastName: string;
  badgeNumber?: string | null;
  station?: string | null;
}

/** Summary drivers returned with every citation. */
export interface CitationDriver {
  driverId: number;
  firstName: string;
  lastName: string;
  licenseNumber?: string | null;
}

export interface CitationRecord {
  citationId: number;
  citationNumber: string;
  recordType: RecordType;
  driverId: number;
  enforcerId: number;
  vehicleUnitType?: string | null;
  plateNumber?: string | null;
  registeredOwner?: string | null;
  otherViolation?: string | null;
  placeOfViolation: string;
  occurredAt: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  driverUnderProtest?: boolean;
  fineAmount?: string | number | null;
  fineOverrideReason?: string | null;
  dueDate?: string | null;
  verified?: boolean;
  settlementStatus: SettlementStatus;
  settledAt?: string | null;
  paymentMethod?: PaymentMethod | null;
  paymentReference?: string | null;
  /**
   * Partial-payment rollup computed by the backend from the citation's
   * violations: how much has been paid, how much is still outstanding, and
   * whether at least one (but not all) violation has been settled.
   */
  paidAmount?: number;
  remainingAmount?: number;
  partiallyPaid?: boolean;
  /** Reference/method of the most recent successful payment, if any. */
  lastPaymentReference?: string | null;
  lastPaymentMethod?: PaymentMethod | null;
  /**
   * Relations the backend joins in (citationInclude). Prisma returns the
   * LOWERCASE relation keys — `enforcer`, not the `Enforcer` the old
   * Sequelize models exposed. A non-paginated list omits them, so everything
   * below is optional.
   */
  violations?: CitationViolationEntry[];
  evidence?: CitationEvidence[];
  enforcer?: CitationEnforcer | null;
  driver?: CitationDriver | null;
}

export interface CitationListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: SettlementStatus;
  recordType?: RecordType;
  underProtest?: boolean;
}

export interface CitationPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CitationPage {
  citations: CitationRecord[];
  pagination: CitationPagination;
}

export interface CitationCreatePayload {
  driverId: number | string;
  recordType?: "citation" | "warning";
  address?: string;
  vehicleUnitType: string;
  plateNumber: string;
  registeredOwner: string;
  /** JSON string OR array — the backend JSON.parses the field. */
  violationTypeIds: number[] | string;
  otherViolation?: string;
  placeOfViolation: string;
  latitude: number | string;
  longitude: number | string;
  driverUnderProtest?: boolean | string;
}

export const citationService = {
  /**
   * POST /citations (enforcer only) — multipart/form-data with up to 5
   * `photos` (see middleware/upload.js). `violationTypeIds` must be a JSON
   * string; this helper serialises an array for you.
   */
  createCitation: async (
    payload: CitationCreatePayload,
    photos: Array<File | Blob> = []
  ): Promise<CitationRecord> => {
    const form = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      form.append(
        key,
        key === "violationTypeIds" && Array.isArray(value)
          ? JSON.stringify(value)
          : String(value)
      );
    });
    photos.forEach((photo, index) => {
      form.append("photos", photo, `evidence-${index}.jpg`);
    });

    const res = await api.post<ApiEnvelope<CitationRecord>>("/citations", form);
    if (!res.data?.data) throw new Error("Malformed citation response");
    return res.data.data;
  },

  /** GET /citations/mine — the logged-in enforcer's own citations. */
  listMyCitations: async (): Promise<CitationRecord[]> => {
    const res = await api.get<ApiEnvelope<CitationRecord[]>>("/citations/mine");
    return res.data?.data ?? [];
  },

  /** GET /citations/driver/mine — the logged-in driver's violations. */
  listMyViolations: async (): Promise<CitationRecord[]> => {
    const res = await api.get<ApiEnvelope<CitationRecord[]>>("/citations/driver/mine");
    return res.data?.data ?? [];
  },

  /**
   * GET /citations — admin Violation Monitoring list.
   * Backend answers { citations, pagination } (NOT a bare array) — unwrapList
   * keeps this a plain array; pass page/limit via params for paging.
   */
  listAllCitations: async (params: CitationListParams = {}): Promise<CitationRecord[]> => {
    const res = await api.get<ApiEnvelope<unknown>>("/citations", { params });
    return unwrapList<CitationRecord>(res.data?.data, "citations");
  },

  /**
   * GET /citations — paged variant for the admin Violations register.
   * Same endpoint as listAllCitations, but preserves the backend's
   * `{ citations, pagination }` shape so the table can page. listAllCitations
   * remains available for callers that only need the array.
   */
  listCitationsPage: async (params: CitationListParams = {}): Promise<CitationPage> => {
    const res = await api.get<ApiEnvelope<unknown>>("/citations", { params });
    const data = res.data?.data as
      | { citations?: CitationRecord[]; pagination?: CitationPagination }
      | undefined;
    return {
      citations: Array.isArray(data?.citations) ? data.citations : [],
      pagination: {
        page: Number(data?.pagination?.page) || Number(params.page) || 1,
        limit: Number(data?.pagination?.limit) || Number(params.limit) || 8,
        total: Number(data?.pagination?.total) || 0,
        totalPages: Number(data?.pagination?.totalPages) || 0,
      },
    };
  },

  /** GET /citations/:id — driver, enforcer or admin. */
  getCitation: async (citationId: number | string): Promise<CitationRecord> => {
    const res = await api.get<ApiEnvelope<CitationRecord>>(`/citations/${citationId}`);
    if (!res.data?.data) throw new Error("Malformed citation response");
    return res.data.data;
  },

  /** PATCH /citations/:id/verify — admin marks the citation verified. */
  verifyCitation: async (citationId: number | string): Promise<CitationRecord> => {
    const res = await api.patch<ApiEnvelope<CitationRecord>>(`/citations/${citationId}/verify`);
    if (!res.data?.data) throw new Error("Malformed citation response");
    return res.data.data;
  },

  /** PATCH /citations/:id/fine-amount — admin override (reason required). */
  overrideFineAmount: async (
    citationId: number | string,
    input: { fineAmount: number; reason: string }
  ): Promise<CitationRecord> => {
    const res = await api.patch<ApiEnvelope<CitationRecord>>(
      `/citations/${citationId}/fine-amount`,
      input
    );
    if (!res.data?.data) throw new Error("Malformed citation response");
    return res.data.data;
  },

  /** PATCH /citations/:id/settle — admin records an offline settlement. */
  settleCitation: async (
    citationId: number | string,
    input: { paymentMethod?: PaymentMethod; paymentReference?: string } = {}
  ): Promise<CitationRecord> => {
    const res = await api.patch<ApiEnvelope<CitationRecord>>(
      `/citations/${citationId}/settle`,
      input
    );
    if (!res.data?.data) throw new Error("Malformed citation response");
    return res.data.data;
  },

  /** PATCH /citations/:id/remind — admin sends a one-off payment reminder. */
  sendReminder: async (citationId: number | string): Promise<void> => {
    await api.patch<ApiEnvelope<null>>(`/citations/${citationId}/remind`);
  },

  /** PATCH /citations/:id/cancel — admin cancels an unsettled citation. */
  cancelCitation: async (citationId: number | string): Promise<CitationRecord> => {
    const res = await api.patch<ApiEnvelope<CitationRecord>>(`/citations/${citationId}/cancel`);
    if (!res.data?.data) throw new Error("Malformed citation response");
    return res.data.data;
  },

  /** PATCH /citations/:id/protest — admin resolves a driver's protest. */
  resolveProtest: async (
    citationId: number | string,
    action: "uphold" | "dismiss"
  ): Promise<CitationRecord> => {
    const res = await api.patch<ApiEnvelope<CitationRecord>>(`/citations/${citationId}/protest`, {
      action,
    });
    if (!res.data?.data) throw new Error("Malformed citation response");
    return res.data.data;
  },
};
