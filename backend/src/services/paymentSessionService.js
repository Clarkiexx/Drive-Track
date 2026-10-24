/**
 * Shared helpers for the one active Xendit checkout session a citation may
 * have. Keeping this logic in one place means the driver checkout, the
 * administrator's offline settlement, and citation cancellation all agree on
 * what "unfinished payment" means.
 */

const xendit = require('./xenditService');

/** Xendit session ids look like `ps-<alphanumeric>`. */
function isSessionReference(value) {
  return /^ps-[A-Za-z0-9]+$/.test(String(value || ''));
}

/** 30 minutes, matching createPaymentSession()'s expires_at. */
const PAYMENT_SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * How long a `creating` claim is allowed to block other requests. If the
 * process dies between the claim and the Xendit call, another request can
 * take over after this window.
 */
const PAYMENT_LOCK_MS = 45 * 1000;

function expiryTime(citation) {
  if (!citation?.paymentExpiresAt) return 0;
  const value = new Date(citation.paymentExpiresAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

/**
 * Returns the persisted, unexpired checkout for a pending citation, or null.
 * This is a database-only check: it is intentionally cheap enough to call on
 * page load. `createCheckout` performs the authoritative Xendit check before
 * creating anything new.
 */
function activeCheckout(citation) {
  if (!citation || citation.settlementStatus !== 'pending') return null;
  if (citation.paymentSessionStatus !== 'pending') return null;
  if (!citation.paymentCheckoutUrl || !isSessionReference(citation.paymentReference)) return null;
  if (expiryTime(citation) <= Date.now()) return null;

  return {
    checkoutUrl: citation.paymentCheckoutUrl,
    paymentSessionId: citation.paymentReference,
    expiresAt: new Date(citation.paymentExpiresAt).toISOString(),
  };
}

/**
 * Cancels a specific Xendit session reference. Best-effort: a cancellation
 * failure is logged, not thrown, because the citation state must still be
 * settled/cancelled locally. Returns false only when an actual cancellation
 * attempt failed; a missing/non-session reference is a successful no-op.
 */
async function cancelSessionReference(reference) {
  if (!isSessionReference(reference)) return true;
  try {
    await xendit.cancelPaymentSession(reference);
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[payments] could not cancel session:', err.message);
    return false;
  }
}

module.exports = {
  isSessionReference,
  activeCheckout,
  cancelSessionReference,
  expiryTime,
  PAYMENT_SESSION_TTL_MS,
  PAYMENT_LOCK_MS,
};
