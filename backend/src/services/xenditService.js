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

function isConfigured() {
  return Boolean(process.env.XENDIT_SECRET_KEY);
}

function authHeader() {
  // Xendit authenticates with the secret key as the basic-auth username
  // and an empty password.
  return `Basic ${Buffer.from(`${process.env.XENDIT_SECRET_KEY}:`).toString('base64')}`;
}

async function xenditFetch(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
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

function allowedChannels() {
  const raw = (process.env.XENDIT_ALLOWED_CHANNELS || '').trim();
  if (!raw) return undefined; // omit → Xendit offers all enabled channels
  return raw.split(',').map((c) => c.trim()).filter(Boolean);
}

/**
 * Creates a PAY / PAYMENT_LINK hosted-checkout session for a citation.
 * Amount MUST be the server-side citation fineAmount (integer pesos).
 */
async function createPaymentSession({ citationId, citationNumber, amount }) {
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
    success_return_url: process.env.XENDIT_SUCCESS_RETURN_URL,
    cancel_return_url: process.env.XENDIT_CANCEL_RETURN_URL,
  };
  const channels = allowedChannels();
  if (channels && channels.length > 0) body.allowed_payment_channels = channels;
  return xenditFetch('/sessions', { method: 'POST', body });
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

module.exports = {
  isConfigured,
  buildReferenceId,
  parseCitationIdFromReference,
  createPaymentSession,
  getPaymentSession,
  getPayment,
};
