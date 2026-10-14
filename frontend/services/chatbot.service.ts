import api, { type ApiEnvelope } from "@/lib/axios";
import type { Role } from "@/constants/roles";

/**
 * Chatbot service — thin wrappers over backend/src/routes/chatbotRoutes.js.
 * GET /chatbot/health: any authenticated role.
 * POST /chatbot/ask: driver only (router uses allowRoles('driver')), so
 * `ask()` requires the caller's role and refuses enforcer/admin locally
 * rather than firing a guaranteed 403.
 */

export interface ChatbotSource {
  title: string;
  authority: string;
  locator: string;
}

export interface ChatbotAnswer {
  answer: string;
  quickQuestions: string[];
  /** Verifiable source references (Phase 1 RAG). Absent on older backends. */
  sources?: ChatbotSource[];
}

export const chatbotService = {
  /** GET /chatbot/health — cheap auth/liveness probe. */
  health: async (): Promise<{ ok: boolean }> => {
    const res = await api.get<ApiEnvelope<{ ok: boolean }>>("/chatbot/health");
    return res.data?.data ?? { ok: false };
  },

  /**
   * POST /chatbot/ask — { message } → { answer, quickQuestions }.
   * `role` must come from useAuth().user.role; non-driver callers are rejected
   * with a clear message (backend would answer 403 "Forbidden").
   */
  ask: async (message: string, role: Role): Promise<ChatbotAnswer> => {
    if (role !== "driver") {
      throw new Error(
        "The DriveTrack chatbot is available to drivers only — this account is signed in as " +
          `${role}.`
      );
    }
    const trimmed = message.trim();
    if (!trimmed) throw new Error("A message is required");
    const res = await api.post<ApiEnvelope<ChatbotAnswer>>("/chatbot/ask", {
      message: trimmed,
    });
    if (!res.data?.data) throw new Error("Malformed chatbot response");
    return res.data.data;
  },
};
