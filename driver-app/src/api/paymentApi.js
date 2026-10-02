import client from './client';

/** Starts an online payment: creates a Xendit hosted-checkout session. */
export function createCheckout(citationId) {
  return client.post(`/payments/citations/${citationId}/checkout`);
}
