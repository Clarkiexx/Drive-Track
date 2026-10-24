import api, { type ApiEnvelope } from "@/lib/axios";

/**
 * Payment service — thin wrapper over backend/src/routes/paymentRoutes.js.
 *
 * Only the driver-facing checkout is a client call. POST /payments/webhook is
 * Xendit → backend (guarded by x-callback-token) and GET /payments/return is a
 * plain browser landing page, so neither belongs in the browser bundle.
 */

export interface CheckoutSession {
  checkoutUrl: string;
  paymentSessionId: string;
  expiresAt?: string;
  /** True when the backend returned an already-open session instead of creating one. */
  resumed?: boolean;
  /** Amount actually charged by this session (partial payments charge a subset). */
  amount?: number;
  /** Violations covered by this session; absent when the whole citation is paid. */
  violationIds?: number[];
  /** True when the session covers the citation total (no per-violation selection). */
  legacy?: boolean;
}

export interface CheckoutStatus {
  settled: boolean;
  /** Total paid so far across this citation's violations. */
  paidAmount?: number;
  /** Amount still outstanding; 0 once every violation is settled. */
  remainingAmount?: number;
}

export interface ActiveCheckout {
  active: boolean;
  settled?: boolean;
  checkoutUrl?: string;
  paymentSessionId?: string;
  expiresAt?: string;
  /** Amount the resumable session charges. */
  amount?: number;
  /** Violations the resumable session covers. */
  violationIds?: number[];
  /** True when the session covers the citation total (no per-violation selection). */
  legacy?: boolean;
}

export const paymentService = {
  /**
   * POST /payments/citations/:id/checkout (driver) — starts a Xendit
   * hosted-checkout session. Redirect the browser to `checkoutUrl`.
   *
   * Pass `violationIds` to pay only the selected violations (partial payment);
   * omit it to keep the legacy behaviour of charging the whole citation, in
   * which case the request is sent with no body. If the backend already has an
   * open session for the same selection it resumes it and sets `resumed`.
   */
  createCheckout: async (
    citationId: number | string,
    violationIds?: number[]
  ): Promise<CheckoutSession> => {
    const url = `/payments/citations/${citationId}/checkout`;
    const res =
      violationIds === undefined
        ? await api.post<ApiEnvelope<CheckoutSession>>(url)
        : await api.post<ApiEnvelope<CheckoutSession>>(url, { violationIds });
    if (!res.data?.data?.checkoutUrl) throw new Error("Malformed checkout response");
    return res.data.data;
  },
  /**
   * GET /payments/citations/:id/checkout (driver) — returns the unfinished
   * session the backend already has for this citation, if any, so the driver
   * can resume instead of starting (and paying for) a second one. This is a
   * database read only (no Xendit call), safe to run on every page load.
   */
  getActiveCheckout: async (citationId: number | string): Promise<ActiveCheckout> => {
    const res = await api.get<ApiEnvelope<ActiveCheckout>>(
      `/payments/citations/${citationId}/checkout`
    );
    return res.data?.data ?? { active: false };
  },
  /**
   * POST /payments/citations/:id/checkout/cancel (driver) — abandons the open
   * checkout session so a different violation selection can be paid. Returns
   * `completed: true` when the session had already been paid, in which case
   * there is nothing to cancel.
   */
  cancelCheckout: async (
    citationId: number | string
  ): Promise<{ cancelled: boolean; completed?: boolean }> => {
    const res = await api.post<ApiEnvelope<{ cancelled: boolean; completed?: boolean }>>(
      `/payments/citations/${citationId}/checkout/cancel`
    );
    return res.data?.data ?? { cancelled: false };
  },
  /**
   * GET /payments/citations/:id/status (driver) — re-verifies the pending
   * checkout against Xendit and settles the covered violations when the
   * payment completed, then reports the citation's running `paidAmount` and
   * `remainingAmount` for partial payments. Safe to call on tab focus after
   * returning from hosted checkout; never throws for business outcomes
   * ({ settled: false }), only for transport failures — callers should swallow
   * errors and just reload.
   */
  getStatus: async (citationId: number | string): Promise<CheckoutStatus> => {
    const res = await api.get<ApiEnvelope<CheckoutStatus>>(
      `/payments/citations/${citationId}/status`
    );
    return res.data?.data ?? { settled: false };
  },
};
