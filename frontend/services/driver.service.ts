import api, { type ApiEnvelope, unwrapList } from "@/lib/axios";
import type { VerificationStatus } from "@/constants/violations";
import type { CitationRecord } from "@/services/citation.service";

/**
 * Driver service — thin wrappers over backend/src/routes/driverRoutes.js.
 * Returns the unwrapped `data` of the backend envelope; failures reject with
 * an AxiosError (getApiErrorMessage() reads the backend `message`).
 */

export interface DriverRecord {
  driverId: number;
  firstName: string;
  middleInitial?: string | null;
  lastName: string;
  address?: string | null;
  contactNumber?: string | null;
  licenseNumber: string;
  username?: string;
  mustChangePassword?: boolean;
  verificationStatus?: VerificationStatus;
  statusReason?: string | null;
  statusChangedAt?: string | null;
  licensePhotoPath?: string | null;
  nationality?: string | null;
  sex?: string | null;
  dateOfBirth?: string | null;
  weightKg?: string | number | null;
  heightM?: string | number | null;
  expirationDate?: string | null;
  agencyCode?: string | null;
  bloodType?: string | null;
  eyeColor?: string | null;
  dlCodes?: string | null;
  condition?: string | null;
}

export interface DriverListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: VerificationStatus;
}

export interface DriverPayload {
  firstName: string;
  middleInitial?: string;
  lastName: string;
  licenseNumber: string;
  address?: string;
  contactNumber?: string;
  nationality?: string;
  sex?: string;
  dateOfBirth?: string;
  weightKg?: string | number;
  heightM?: string | number;
  expirationDate?: string;
  agencyCode?: string;
  bloodType?: string;
  eyeColor?: string;
  dlCodes?: string;
  condition?: string;
}

export const driverService = {
  /**
   * GET /drivers — admin's paginated Driver Management list.
   * Backend answers { drivers, pagination } (NOT a bare array) — unwrapList
   * keeps this a plain array; drop `limit`/`page` into params for paging.
   */
  listDrivers: async (params: DriverListParams = {}): Promise<DriverRecord[]> => {
    const res = await api.get<ApiEnvelope<unknown>>("/drivers", { params });
    return unwrapList<DriverRecord>(res.data?.data, "drivers");
  },

  /** GET /drivers/search?licenseNumber=&fullName= — enforcer/admin lookup. */
  searchDrivers: async (
    params: { licenseNumber?: string; fullName?: string } = {}
  ): Promise<DriverRecord[]> => {
    const res = await api.get<ApiEnvelope<DriverRecord[]>>("/drivers/search", { params });
    return res.data?.data ?? [];
  },

  /** GET /drivers/:id — admin or enforcer. */
  getDriver: async (driverId: number | string): Promise<DriverRecord> => {
    const res = await api.get<ApiEnvelope<DriverRecord>>(`/drivers/${driverId}`);
    if (!res.data?.data) throw new Error("Malformed driver response");
    return res.data.data;
  },

  /** GET /drivers/:id/citations — admin or enforcer. */
  getDriverCitations: async (driverId: number | string): Promise<CitationRecord[]> => {
    const res = await api.get<ApiEnvelope<CitationRecord[]>>(`/drivers/${driverId}/citations`);
    return res.data?.data ?? [];
  },

  /**
   * POST /drivers — admin "Add Driver" (plain JSON) or enforcer on-the-spot
   * creation (multipart). The photo field is `licensePhoto`; without a file a
   * JSON body is sent, which middleware/uploadLicense.js passes through.
   */
  createDriver: async (
    payload: DriverPayload,
    licensePhoto?: File | Blob | null
  ): Promise<DriverRecord> => {
    if (!licensePhoto) {
      const res = await api.post<ApiEnvelope<DriverRecord>>("/drivers", payload);
      if (!res.data?.data) throw new Error("Malformed driver response");
      return res.data.data;
    }

    const form = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        form.append(key, String(value));
      }
    });
    form.append("licensePhoto", licensePhoto);

    const res = await api.post<ApiEnvelope<DriverRecord>>("/drivers", form);
    if (!res.data?.data) throw new Error("Malformed driver response");
    return res.data.data;
  },

  /** PATCH /drivers/:id — admin partial profile update. */
  updateDriver: async (
    driverId: number | string,
    payload: Partial<DriverPayload>
  ): Promise<DriverRecord> => {
    const res = await api.patch<ApiEnvelope<DriverRecord>>(`/drivers/${driverId}`, payload);
    if (!res.data?.data) throw new Error("Malformed driver response");
    return res.data.data;
  },

  /**
   * PATCH /drivers/:id/status — admin changes verification status.
   * Backend expects { status, reason } (NOT { verificationStatus }).
   */
  updateDriverStatus: async (
    driverId: number | string,
    input: { status: VerificationStatus; reason?: string }
  ): Promise<{ driverId: number; verificationStatus: VerificationStatus }> => {
    const res = await api.patch<ApiEnvelope<{ driverId: number; verificationStatus: VerificationStatus }>>(
      `/drivers/${driverId}/status`,
      input
    );
    if (!res.data?.data) throw new Error("Malformed driver response");
    return res.data.data;
  },

  /**
   * DELETE /drivers/:id — NOT CALLABLE. The route exists but
   * driverController.deleteDriver unconditionally answers
   * 405 "Drivers cannot be deleted. Historical records are retained".
   * Fails locally so no request (and no confusing 405 toast) is ever made.
   */
  deleteDriver: async (driverId: number | string): Promise<never> => {
    throw new Error(
      `Driver #${driverId} cannot be deleted — the backend always answers 405 ` +
        `(records are retained for enforcement history). Use updateDriverStatus() ` +
        `with "revoked" or "suspended" instead.`
    );
  },
};
