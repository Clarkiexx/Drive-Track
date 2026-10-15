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

export interface CheckoutStatus {
  settled: boolean;
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
  /**
   * GET /payments/citations/:id/status (driver) — re-verifies a pending
   * citation against Xendit and settles it when the payment completed.
   * Safe to call on tab focus after returning from hosted checkout; never
   * throws for business outcomes ({ settled: false }), only for transport
   * failures — callers should swallow errors and just reload.
   */
  getStatus: async (citationId: number | string): Promise<CheckoutStatus> => {
    const res = await api.get<ApiEnvelope<CheckoutStatus>>(
      `/payments/citations/${citationId}/status`
    );
    return res.data?.data ?? { settled: false };
  },
};
