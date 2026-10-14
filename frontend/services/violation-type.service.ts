import { z } from "zod";
import api, { type ApiEnvelope } from "@/lib/axios";

/**
 * Violation-type service — thin wrappers over
 * backend/src/routes/violationTypeRoutes.js. GET is open to any logged-in
 * role; mutations are admin-only. Returns the unwrapped `data` of the
 * backend envelope.
 */

export const VIOLATION_CATEGORIES = ["moving", "non_moving"] as const;
export type ViolationCategory = (typeof VIOLATION_CATEGORIES)[number];

export interface ViolationTypeRecord {
  violationTypeId: number;
  articleSection: string;
  description: string;
  category: ViolationCategory;
  defaultPenalty: string | number;
  minPenalty?: string | number | null;
  maxPenalty?: string | number | null;
  isActive?: boolean;
}

/** Displayed legal band: "₱min – ₱max" when a real range exists, else single. */
export function hasPenaltyRange(row: Pick<ViolationTypeRecord, "minPenalty" | "maxPenalty">): boolean {
  return (
    row.minPenalty !== null &&
    row.minPenalty !== undefined &&
    row.minPenalty !== "" &&
    row.maxPenalty !== null &&
    row.maxPenalty !== undefined &&
    row.maxPenalty !== "" &&
    Number(row.minPenalty) !== Number(row.maxPenalty)
  );
}

/**
 * Penalty cell text mirroring formatPeso ("₱" + en-US thousands): the
 * "₱min – ₱max" band when a real range exists, otherwise the single
 * charged default. Same shape the reference table uses.
 */
export function formatPenaltyRange(
  row: Pick<ViolationTypeRecord, "defaultPenalty" | "minPenalty" | "maxPenalty">
): string {
  const peso = (value: string | number): string => {
    const numeric = Number(value);
    return `₱${Number.isFinite(numeric) ? numeric.toLocaleString("en-US") : 0}`;
  };
  if (hasPenaltyRange(row)) {
    return `${peso(row.minPenalty as string | number)} – ${peso(row.maxPenalty as string | number)}`;
  }
  return peso(row.defaultPenalty);
}

const penaltyNumber = (message: string) =>
  z.coerce.number({ message }).min(0, message);

const isRangeValid = (value: {
    defaultPenalty?: number;
    minPenalty?: number | null;
    maxPenalty?: number | null;
  }) => {
    const { defaultPenalty, minPenalty, maxPenalty } = value;
    if (
      minPenalty !== undefined &&
      minPenalty !== null &&
      maxPenalty !== undefined &&
      maxPenalty !== null &&
      minPenalty > maxPenalty
    ) {
      return false;
    }
    if (
      defaultPenalty !== undefined &&
      minPenalty !== undefined &&
      minPenalty !== null &&
      defaultPenalty < minPenalty
    ) {
      return false;
    }
    if (
      defaultPenalty !== undefined &&
      maxPenalty !== undefined &&
      maxPenalty !== null &&
      defaultPenalty > maxPenalty
    ) {
      return false;
    }
    return true;
  };

export const violationTypeCreateSchema = z
  .object({
    articleSection: z.string().trim().min(1, "Article/Section is required"),
    description: z.string().trim().min(1, "Description is required"),
    category: z.enum(VIOLATION_CATEGORIES, { message: "Category must be moving or non_moving" }),
    defaultPenalty: z.coerce
      .number({ message: "Default penalty must be a positive number" })
      .min(0, "Default penalty must be a positive number"),
    minPenalty: penaltyNumber("Minimum penalty must be a positive number").optional(),
    maxPenalty: penaltyNumber("Maximum penalty must be a positive number").optional(),
  })
  .refine(isRangeValid, {
    message: "Minimum cannot exceed maximum, and the default must sit inside the range",
  });
export type ViolationTypeCreateInput = z.infer<typeof violationTypeCreateSchema>;

/** Partial form of the same fields (PATCH validates only what is sent). */
export const violationTypeUpdateSchema = z
  .object({
    articleSection: z.string().trim().min(1, "Article/Section cannot be empty"),
    description: z.string().trim().min(1, "Description cannot be empty"),
    category: z.enum(VIOLATION_CATEGORIES, { message: "Category must be moving or non_moving" }),
    defaultPenalty: z.coerce.number().min(0, "Default penalty must be a positive number"),
    minPenalty: penaltyNumber("Minimum penalty must be a positive number").optional(),
    maxPenalty: penaltyNumber("Maximum penalty must be a positive number").optional(),
  })
  .partial()
  .refine(isRangeValid, {
    message: "Minimum cannot exceed maximum, and the default must sit inside the range",
  });
export type ViolationTypeUpdateInput = z.infer<typeof violationTypeUpdateSchema>;

export const violationTypeService = {
  /** GET /violation-types — ?active=true narrows to active rows. */
  list: async (params: { active?: boolean | string } = {}): Promise<ViolationTypeRecord[]> => {
    const res = await api.get<ApiEnvelope<ViolationTypeRecord[]>>("/violation-types", {
      params: params.active !== undefined ? { active: String(params.active) } : {},
    });
    return res.data?.data ?? [];
  },

  /** GET /violation-types?active=true — convenience for enforcement screens. */
  listActive: async (): Promise<ViolationTypeRecord[]> =>
    violationTypeService.list({ active: true }),

  /** POST /violation-types — admin only. */
  create: async (input: ViolationTypeCreateInput): Promise<ViolationTypeRecord> => {
    const body = violationTypeCreateSchema.parse(input);
    const res = await api.post<ApiEnvelope<ViolationTypeRecord>>("/violation-types", body);
    if (!res.data?.data) throw new Error("Malformed violation type response");
    return res.data.data;
  },

  /** PATCH /violation-types/:id — admin only, partial update. */
  update: async (
    violationTypeId: number | string,
    input: ViolationTypeUpdateInput
  ): Promise<ViolationTypeRecord> => {
    const body = violationTypeUpdateSchema.parse(input);
    const res = await api.patch<ApiEnvelope<ViolationTypeRecord>>(
      `/violation-types/${violationTypeId}`,
      body
    );
    if (!res.data?.data) throw new Error("Malformed violation type response");
    return res.data.data;
  },

  /** PATCH /violation-types/:id/status — { isActive: boolean }. */
  updateStatus: async (
    violationTypeId: number | string,
    isActive: boolean
  ): Promise<ViolationTypeRecord> => {
    const res = await api.patch<ApiEnvelope<ViolationTypeRecord>>(
      `/violation-types/${violationTypeId}/status`,
      { isActive }
    );
    if (!res.data?.data) throw new Error("Malformed violation type response");
    return res.data.data;
  },
};
