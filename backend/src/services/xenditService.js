/**
 * Minimal Xendit Payment Sessions client (Phase 4.1).
 *
 * Uses the current Payment Sessions API (NOT the legacy /v2/invoices API):
 *   POST /sessions  { session_type: 'PAY', mode: 'PAYMENT_LINK', ... }
 *   GET  /sessions/{payment_session_id}
 *
 * No new npm dependencies — uses the Node 18+ global fetch.
 * All secrets stay server-side via environment variables.
 */

const API_BASE = (process.env.XENDIT_API_URL || 'https://api.xendit.co').replace(/\/+$/, '');

/**
 * A hung Xendit request must not hold the citation's creation claim forever.
 * Node 18+ provides AbortSignal.timeout(); the caller marks the claim failed
 * when this rejects.
 */
const REQUEST_TIMEOUT_MS = 20 * 1000;

function isConfigured() {
  return Boolean(process.env.XENDIT_SECRET_KEY);
}

function authHeader() {
  // Xendit authenticates with the secret key as the basic-auth username
  // and an empty password.
  return `Basic ${Buffer.from(`${process.env.XENDIT_SECRET_KEY}:`).toString('base64')}`;
}

async function xenditFetch(path, { method = 'GET', body, headers = {} } = {}) {
  const timeoutSignal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      : undefined;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: timeoutSignal,
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail = payload?.message || payload?.error_code || `Xendit request failed (${response.status})`;
    const err = new Error(detail);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

/**
 * Builds the unique per-session merchant reference.
 * Format: DRIVETRACK-CITATION-<citationId>-<suffix>
 * The webhook correlates back via ^DRIVETRACK-CITATION-(\d+)-
 */
function buildReferenceId(citationId, suffix) {
  const rand = suffix || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  return `DRIVETRACK-CITATION-${citationId}-${rand}`;
}

/** Extracts the citationId from a session reference_id, or null. */
function parseCitationIdFromReference(referenceId) {
  const match = /^DRIVETRACK-CITATION-(\d+)-/.exec(String(referenceId || ''));
  return match ? Number(match[1]) : null;
}

/**
 * Turns the configured success/cancel URL into a citation-specific return URL.
 * The configured value may be:
 *   - /home/violations?payment=success  -> /home/violations/<id>?payment=success
 *   - /payment-return?payment=success  -> left as-is (custom page)
 *   - any URL containing {citationId}  -> placeholder replaced
 * Keeping this in the service means every new checkout returns the driver to
 * the receipt, where the "Back to My Violations" button lives.
 */
function buildReturnUrl(rawUrl, citationId, paymentStatus) {
  if (!rawUrl) return undefined;

  const withId = String(rawUrl).replace(/\{citationId\}/g, String(citationId));
  try {
    const url = new URL(withId);
    if (/\/home\/violations\/?$/.test(url.pathname)) {
      url.pathname = `/home/violations/${citationId}`;
    }
    url.searchParams.set('payment', paymentStatus);
    return url.toString();
  } catch {
    return withId;
  }
}

function allowedChannels() {
  const raw = (process.env.XENDIT_ALLOWED_CHANNELS || '').trim();
  if (!raw) return undefined; // omit → Xendit offers all enabled channels
  return raw.split(',').map((c) => c.trim()).filter(Boolean);
}

/**
 * Creates a PAY / PAYMENT_LINK hosted-checkout session for a citation.
 * Amount MUST be the server-side citation fineAmount (integer pesos).
 */
async function createPaymentSession({ citationId, citationNumber, amount, idempotencyKey }) {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const body = {
    reference_id: buildReferenceId(citationId),
    session_type: 'PAY',
    mode: 'PAYMENT_LINK',
    currency: 'PHP',
    country: 'PH',
    amount,
    capture_method: 'AUTOMATIC',
    allow_save_payment_method: 'DISABLED',
    expires_at: expiresAt,
    description: `DriveTrack citation ${citationNumber}`,
    metadata: { citationId: String(citationId), citationNumber },
    success_return_url: buildReturnUrl(
      process.env.XENDIT_SUCCESS_RETURN_URL,
      citationId,
      'success'
    ),
    cancel_return_url: buildReturnUrl(
      process.env.XENDIT_CANCEL_RETURN_URL,
      citationId,
      'cancelled'
    ),
  };
  const channels = allowedChannels();
  if (channels && channels.length > 0) body.allowed_payment_channels = channels;
  // Xendit supports idempotency keys on POST endpoints. Passing the claim's
  // attempt key means a retried request that lost the HTTP response cannot
  // create a second session. If the Sessions API ignores the header, the
  // database claim still guarantees a single active session.
  const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
  return xenditFetch('/sessions', { method: 'POST', body, headers });
}

/** Authoritative session-status lookup used by webhook verification (4.2). */
async function getPaymentSession(paymentSessionId) {
  return xenditFetch(`/sessions/${paymentSessionId}`);
}

/**
 * Authoritative payment-status lookup (Phase 4.2).
 * The session lifecycle and the underlying Payment are verified separately:
 * a COMPLETED session alone never settles — the payment itself must be
 * SUCCEEDED. Docs: GET /v3/payments/{payment_id} (api-version 2024-11-11).
 */
async function getPayment(paymentId) {
  return xenditFetch(`/v3/payments/${paymentId}`, {
    headers: { 'api-version': '2024-11-11' },
  });
}

/**
 * Cancels an ACTIVE hosted-checkout session, invalidating its payment link.
 * Used when a citation is settled offline or cancelled by an administrator,
 * so a driver cannot pay an online session for a citation that is already
 * settled. Best-effort: the caller decides whether failure is fatal.
 */
async function cancelPaymentSession(paymentSessionId) {
  if (!paymentSessionId) return null;
  return xenditFetch(`/sessions/${encodeURIComponent(paymentSessionId)}/cancel`, {
    method: 'POST',
  });
}

module.exports = {
  isConfigured,
  buildReferenceId,
  parseCitationIdFromReference,
  buildReturnUrl,
  createPaymentSession,
  getPaymentSession,
  getPayment,
  cancelPaymentSession,
};
