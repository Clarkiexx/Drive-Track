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
}

export const paymentService = {
  /**
   * POST /payments/citations/:id/checkout (driver) — starts a Xendit
   * hosted-checkout session. Redirect the browser to `checkoutUrl`.
   */
  createCheckout: async (citationId: number | string): Promise<CheckoutSession> => {
    const res = await api.post<ApiEnvelope<CheckoutSession>>(
      `/payments/citations/${citationId}/checkout`
    );
    if (!res.data?.data?.checkoutUrl) throw new Error("Malformed checkout response");
    return res.data.data;
  },
};
