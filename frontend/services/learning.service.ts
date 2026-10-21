import { z } from "zod";
import api, { type ApiEnvelope } from "@/lib/axios";
import {
  SIGN_CATEGORIES,
  SIGN_GLYPHS,
  SIGN_SHAPES,
  type SignCategory,
  type SignGlyph,
  type SignShape,
} from "@/data/trafficSigns";

/**
 * Learning Center service — thin wrappers over
 * backend/src/routes/learningRoutes.js. GET is open to any logged-in role;
 * mutations are admin-only. Returns the unwrapped `data` of the backend
 * envelope.
 */

export interface LearningSignRecord {
  id: string;
  name: string;
  category: SignCategory;
  shape: SignShape;
  color: string;
  meaning: string;
  glyph: SignGlyph;
  prohibited: boolean;
  solid: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface LearningQuizRecord {
  id: string;
  signId: string;
  question: string;
  options: string[];
  correctIndex: number;
  isActive: boolean;
  /** Embedded by the API on quiz reads; null only if the sign row vanished. */
  sign?: LearningSignRecord | null;
}

/**
 * The "Educational" practice section — text-only study questions (no sign).
 * `options` holds 3 or 4 answers; `correctIndex` is 0-based into it.
 */
export interface LearningEducationalRecord {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  sortOrder: number;
  isActive: boolean;
}

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

const hexColor = (message: string) => z.string().regex(HEX_COLOR, message);

export const learningSignCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name must be 120 characters or fewer"),
  category: z.enum(SIGN_CATEGORIES, {
    message: "Category must be Regulatory, Warning or Informational",
  }),
  shape: z.enum(SIGN_SHAPES, { message: "Pick one of the drawable sign shapes" }),
  glyph: z.enum(SIGN_GLYPHS, { message: "Pick one of the drawable sign symbols" }),
  color: hexColor("Color must be a hex value like #DC2626"),
  meaning: z
    .string()
    .trim()
    .min(1, "Meaning is required")
    .max(600, "Meaning must be 600 characters or fewer"),
  prohibited: z.boolean().optional(),
  solid: z.boolean().optional(),
  sortOrder: z.coerce
    .number()
    .int("Sort order must be a whole number")
    .min(0, "Sort order cannot be negative")
    .max(9999, "Sort order must be 9999 or lower")
    .optional(),
});
export type LearningSignCreateInput = z.infer<typeof learningSignCreateSchema>;

/** PATCH validates only what is sent; the admin dialog sends the full form. */
export const learningSignUpdateSchema = learningSignCreateSchema.partial();
export type LearningSignUpdateInput = z.infer<typeof learningSignUpdateSchema>;

export const learningQuizCreateSchema = z.object({
  signId: z.string().trim().min(1, "Pick the sign this question shows"),
  question: z
    .string()
    .trim()
    .min(1, "Question is required")
    .max(300, "Question must be 300 characters or fewer"),
  options: z
    .array(z.string().trim().min(1, "Answer options cannot be empty"))
    .length(4, "Exactly 4 answer options are required"),
  correctIndex: z.coerce
    .number()
    .int("The correct answer must be option 1-4")
    .min(0, "The correct answer must be option 1-4")
    .max(3, "The correct answer must be option 1-4"),
});
export type LearningQuizCreateInput = z.infer<typeof learningQuizCreateSchema>;

export const learningQuizUpdateSchema = learningQuizCreateSchema.partial();
export type LearningQuizUpdateInput = z.infer<typeof learningQuizUpdateSchema>;

export const learningEducationalCreateSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "Question is required")
    .max(300, "Question must be 300 characters or fewer"),
  options: z
    .array(z.string().trim().min(1, "Answer options cannot be empty"))
    .min(3, "At least 3 answer options are required")
    .max(4, "At most 4 answer options are allowed"),
  correctIndex: z.coerce
    .number()
    .int("The correct answer must be option 1-4")
    .min(0, "The correct answer must be option 1-4")
    .max(3, "The correct answer must be option 1-4"),
  sortOrder: z.coerce
    .number()
    .int("Sort order must be a whole number")
    .min(0, "Sort order cannot be negative")
    .max(9999, "Sort order must be 9999 or lower")
    .optional(),
});
export type LearningEducationalCreateInput = z.infer<typeof learningEducationalCreateSchema>;

/** PATCH validates only what is sent; the admin dialog sends the full form. */
export const learningEducationalUpdateSchema = learningEducationalCreateSchema.partial();
export type LearningEducationalUpdateInput = z.infer<typeof learningEducationalUpdateSchema>;

export const learningService = {
  /** GET /learning/signs — ?active=true narrows to rows the driver app shows. */
  listSigns: async (
    params: { active?: boolean | string } = {}
  ): Promise<LearningSignRecord[]> => {
    const res = await api.get<ApiEnvelope<LearningSignRecord[]>>("/learning/signs", {
      params: params.active !== undefined ? { active: String(params.active) } : {},
    });
    return res.data?.data ?? [];
  },

  /** Convenience for the driver Learning Center. */
  listActiveSigns: async (): Promise<LearningSignRecord[]> =>
    learningService.listSigns({ active: true }),

  /** POST /learning/signs — admin only. */
  createSign: async (input: LearningSignCreateInput): Promise<LearningSignRecord> => {
    const body = learningSignCreateSchema.parse(input);
    const res = await api.post<ApiEnvelope<LearningSignRecord>>("/learning/signs", body);
    if (!res.data?.data) throw new Error("Malformed learning sign response");
    return res.data.data;
  },

  /** PATCH /learning/signs/:id — admin only, partial update. */
  updateSign: async (id: string, input: LearningSignUpdateInput): Promise<LearningSignRecord> => {
    const body = learningSignUpdateSchema.parse(input);
    const res = await api.patch<ApiEnvelope<LearningSignRecord>>(`/learning/signs/${id}`, body);
    if (!res.data?.data) throw new Error("Malformed learning sign response");
    return res.data.data;
  },

  /** PATCH /learning/signs/:id/status — { isActive: boolean }. */
  updateSignStatus: async (id: string, isActive: boolean): Promise<LearningSignRecord> => {
    const res = await api.patch<ApiEnvelope<LearningSignRecord>>(`/learning/signs/${id}/status`, {
      isActive,
    });
    if (!res.data?.data) throw new Error("Malformed learning sign response");
    return res.data.data;
  },

  /** GET /learning/quiz — each row carries its embedded `sign`. */
  listQuiz: async (
    params: { active?: boolean | string } = {}
  ): Promise<LearningQuizRecord[]> => {
    const res = await api.get<ApiEnvelope<LearningQuizRecord[]>>("/learning/quiz", {
      params: params.active !== undefined ? { active: String(params.active) } : {},
    });
    return res.data?.data ?? [];
  },

  /** Convenience for the driver Quiz — only live questions with live signs. */
  listActiveQuiz: async (): Promise<LearningQuizRecord[]> =>
    learningService.listQuiz({ active: true }),

  /** POST /learning/quiz — admin only. */
  createQuizQuestion: async (input: LearningQuizCreateInput): Promise<LearningQuizRecord> => {
    const body = learningQuizCreateSchema.parse(input);
    const res = await api.post<ApiEnvelope<LearningQuizRecord>>("/learning/quiz", body);
    if (!res.data?.data) throw new Error("Malformed quiz question response");
    return res.data.data;
  },

  /** PATCH /learning/quiz/:id — admin only, partial update. */
  updateQuizQuestion: async (
    id: string,
    input: LearningQuizUpdateInput
  ): Promise<LearningQuizRecord> => {
    const body = learningQuizUpdateSchema.parse(input);
    const res = await api.patch<ApiEnvelope<LearningQuizRecord>>(`/learning/quiz/${id}`, body);
    if (!res.data?.data) throw new Error("Malformed quiz question response");
    return res.data.data;
  },

  /** PATCH /learning/quiz/:id/status — { isActive: boolean }. */
  updateQuizQuestionStatus: async (
    id: string,
    isActive: boolean
  ): Promise<LearningQuizRecord> => {
    const res = await api.patch<ApiEnvelope<LearningQuizRecord>>(`/learning/quiz/${id}/status`, {
      isActive,
    });
    if (!res.data?.data) throw new Error("Malformed quiz question response");
    return res.data.data;
  },

  /** GET /learning/educational — the "Educational" practice section. */
  listEducational: async (
    params: { active?: boolean | string } = {}
  ): Promise<LearningEducationalRecord[]> => {
    const res = await api.get<ApiEnvelope<LearningEducationalRecord[]>>(
      "/learning/educational",
      {
        params: params.active !== undefined ? { active: String(params.active) } : {},
      }
    );
    return res.data?.data ?? [];
  },

  /** Convenience for the driver Educational Quiz. */
  listActiveEducational: async (): Promise<LearningEducationalRecord[]> =>
    learningService.listEducational({ active: true }),

  /** POST /learning/educational — admin only. */
  createEducational: async (
    input: LearningEducationalCreateInput
  ): Promise<LearningEducationalRecord> => {
    const body = learningEducationalCreateSchema.parse(input);
    const res = await api.post<ApiEnvelope<LearningEducationalRecord>>(
      "/learning/educational",
      body
    );
    if (!res.data?.data) throw new Error("Malformed educational question response");
    return res.data.data;
  },

  /** PATCH /learning/educational/:id — admin only, partial update. */
  updateEducational: async (
    id: string,
    input: LearningEducationalUpdateInput
  ): Promise<LearningEducationalRecord> => {
    const body = learningEducationalUpdateSchema.parse(input);
    const res = await api.patch<ApiEnvelope<LearningEducationalRecord>>(
      `/learning/educational/${id}`,
      body
    );
    if (!res.data?.data) throw new Error("Malformed educational question response");
    return res.data.data;
  },

  /** PATCH /learning/educational/:id/status — { isActive: boolean }. */
  updateEducationalStatus: async (
    id: string,
    isActive: boolean
  ): Promise<LearningEducationalRecord> => {
    const res = await api.patch<ApiEnvelope<LearningEducationalRecord>>(
      `/learning/educational/${id}/status`,
      { isActive }
    );
    if (!res.data?.data) throw new Error("Malformed educational question response");
    return res.data.data;
  },
};
