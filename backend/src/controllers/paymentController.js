const crypto = require('crypto');
const { sequelize, Citation } = require('../models');
const { success, fail } = require('../utils/response');
const { notifyDriver } = require('../services/notificationService');
const xendit = require('../services/xenditService');

// Phase 4.1: in-memory per-citation checkout throttle (60s) to prevent
// Pay-Now tap-spam creating unbounded sessions. No persistence — a server
// restart simply resets the window, which is safe (idempotent settlement).
const CHECKOUT_THROTTLE_MS = 60 * 1000;
const lastCheckoutAt = new Map();

function throttleKey(citationId) {
  return Number(citationId);
}

function isThrottled(citationId) {
  const last = lastCheckoutAt.get(throttleKey(citationId));
  return Boolean(last && Date.now() - last < CHECKOUT_THROTTLE_MS);
}

function markCheckout(citationId) {
  lastCheckoutAt.set(throttleKey(citationId), Date.now());
}

/**
 * POST /payments/citations/:id/checkout — driver starts an online payment.
 * Validates everything server-side, creates a Xendit PAY/PAYMENT_LINK
 * session, and returns the hosted checkout URL. NEVER settles the citation
 * (settlement happens only via the verified webhook in 4.2).
 */
async function createCheckout(req, res, next) {
  try {
    if (!xendit.isConfigured()) {
      return fail(res, 'Online payments are not configured. Please pay at the CTMO office.', 503);
    }

    const citation = await Citation.findByPk(req.params.id);
    if (!citation) return fail(res, 'Citation not found', 404);

    // A driver may only pay their own citation.
    if (citation.driverId !== req.user.id) {
      return fail(res, 'You are not authorized to pay this citation', 403);
    }
    if (citation.recordType !== 'citation') {
      return fail(res, 'Warning-only records do not require payment', 409);
    }
    if (citation.settlementStatus !== 'pending') {
      if (citation.settlementStatus === 'settled') {
        return fail(res, 'This citation is already settled', 409);
      }
      if (citation.settlementStatus === 'cancelled') {
        return fail(res, 'Cancelled citations cannot be paid', 409);
      }
      return fail(res, 'This citation cannot be paid', 409);
    }

    // Amount ALWAYS comes from the server-side citation — never the client.
    const amount = Math.round(Number(citation.fineAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      return fail(res, 'This citation has no payable amount', 422);
    }

    if (isThrottled(citation.citationId)) {
      return fail(res, 'A payment session was just created. Please wait a moment before trying again.', 429);
    }

    const session = await xendit.createPaymentSession({
      citationId: citation.citationId,
      citationNumber: citation.citationNumber,
      amount,
    });

    if (!session?.payment_link_url) {
      return fail(res, 'Unable to start the payment session. Please try again.', 502);
    }

    markCheckout(citation.citationId);
    return success(res, {
      checkoutUrl: session.payment_link_url,
      paymentSessionId: session.payment_session_id,
      expiresAt: session.expires_at,
    }, 'Payment session created');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createCheckout,
  handleWebhook,
  returnPage,
  // Exported for verification/testing; webhook + return page land in 4.2.
  _throttle: { isThrottled, markCheckout, CHECKOUT_THROTTLE_MS },
  _helpers: { verifyCallbackToken, isCompletedEvent, mapChannelToMethod },
};

/** True only for the session-completed lifecycle event. */
function isCompletedEvent(event) {
  return event === 'payment_session.completed';
}

/** Constant-time comparison of the Xendit callback token. */
function verifyCallbackToken(req) {
  const expected = process.env.XENDIT_WEBHOOK_TOKEN || '';
  const received = req.headers['x-callback-token'] || '';
  if (!expected || !received) return false;
  const a = Buffer.from(String(received));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Maps a verified Xendit channel_code to the Citation.paymentMethod enum.
 * Returns null for unknown codes — the caller must reject safely (no
 * settle, no guess). Exact activated codes are confirmed from the Xendit
 * dashboard during testing (D2); this allowlist is deliberately explicit.
 */
function mapChannelToMethod(channelCode) {
  const code = String(channelCode || '').toUpperCase().trim();
  if (code === 'GCASH') return 'gcash';
  if (code === 'MAYA' || code === 'PAYMAYA') return 'maya';
  if (code === 'CARDS') return 'other';
  // Bank-transfer VA-style codes (e.g. BPI_VA, BNI_VA) and explicit
  // BANK_TRANSFER map to bank; anything else is unknown.
  if (code === 'BANK_TRANSFER' || code.includes('BANK') || /_VA$/.test(code)) return 'bank';
  return null;
}

/**
 * POST /payments/webhook — Xendit session/payment event receiver.
 * Public route: authorized by the x-callback-token header, NOT user JWT.
 * Settles ONLY after: token → session COMPLETED → payment SUCCEEDED →
 * PHP + exact amount match → known channel → citation still pending.
 * Everything else is a safe 200 no-op so Xendit stops retrying.
 */
async function handleWebhook(req, res, next) {
  try {
    if (!verifyCallbackToken(req)) {
      return fail(res, 'Invalid webhook token', 401);
    }

    const { event, data = {} } = req.body || {};
    if (!isCompletedEvent(event)) {
      // Expired/failed/payment-object events: acknowledge, change nothing.
      return success(res, null, `Ignored event ${event || 'unknown'}`);
    }

    const paymentSessionId = data.payment_session_id;
    if (!paymentSessionId) {
      // eslint-disable-next-line no-console
      console.warn('[payments] completed webhook without payment_session_id');
      return success(res, null, 'Ignored: no session reference');
    }

    // 1) Authoritative session check — COMPLETED required.
    let session;
    try {
      session = await xendit.getPaymentSession(paymentSessionId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[payments] session lookup failed:', err.message);
      return fail(res, 'Unable to verify payment session', 502);
    }
    if (session?.status !== 'COMPLETED') {
      return success(res, null, 'Ignored: session not completed');
    }

    // 2) Independent payment check — SUCCEEDED required.
    const paymentId = session.payment_id || data.payment_id;
    if (!paymentId) {
      // eslint-disable-next-line no-console
      console.warn('[payments] completed session without payment_id:', paymentSessionId);
      return success(res, null, 'Ignored: no payment reference');
    }
    let payment;
    try {
      payment = await xendit.getPayment(paymentId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[payments] payment lookup failed:', err.message);
      return fail(res, 'Unable to verify payment', 502);
    }
    if (payment?.status !== 'SUCCEEDED') {
      return success(res, null, 'Ignored: payment not succeeded');
    }
    if (String(payment.currency || '').toUpperCase() !== 'PHP') {
      // eslint-disable-next-line no-console
      console.warn('[payments] non-PHP payment:', payment.currency, paymentSessionId);
      return success(res, null, 'Ignored: currency mismatch');
    }

    // 3) Correlate to citation via our stable reference prefix.
    const citationId = xendit.parseCitationIdFromReference(session.reference_id);
    if (!citationId) {
      // eslint-disable-next-line no-console
      console.warn('[payments] unparseable reference_id:', session.reference_id);
      return success(res, null, 'Ignored: unknown reference');
    }

    const t = await sequelize.transaction();
    try {
      const citation = await Citation.findByPk(citationId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!citation) {
        await t.rollback();
        // eslint-disable-next-line no-console
        console.warn('[payments] citation not found:', citationId);
        return success(res, null, 'Ignored: citation not found');
      }
      if (citation.settlementStatus !== 'pending') {
        await t.rollback();
        // Duplicate/late webhook for an already-settled/cancelled record.
        return success(res, null, 'Ignored: citation not pending');
      }

      // 4) Exact amount match against the server-side fine.
      const expected = Math.round(Number(citation.fineAmount));
      const paid = Math.round(Number(payment.request_amount ?? session.amount));
      if (!Number.isFinite(paid) || paid !== expected) {
        await t.rollback();
        // eslint-disable-next-line no-console
        console.warn('[payments] amount mismatch:', { citationId, expected, paid });
        return success(res, null, 'Ignored: amount mismatch');
      }

      // 5) Known channel only — never guess.
      const method = mapChannelToMethod(payment.channel_code);
      if (!method) {
        await t.rollback();
        // eslint-disable-next-line no-console
        console.warn('[payments] unknown channel_code:', payment.channel_code, paymentSessionId);
        return success(res, null, 'Ignored: unknown channel');
      }

      citation.settlementStatus = 'settled';
      citation.settledAt = new Date();
      citation.paymentMethod = method;
      citation.paymentReference = paymentSessionId;
      citation.receivedBy = null; // online payment — no admin/staff handler
      await citation.save({ transaction: t });

      await notifyDriver(
        {
          driverId: citation.driverId,
          citationId: citation.citationId,
          message: `Your online payment for citation ${citation.citationNumber} has been confirmed. Thank you!`,
          notificationType: 'settlement_confirmed',
        },
        { transaction: t }
      );

      await t.commit();
      // NOTE: no audit-log row here — AuditLog.admin_id is NOT NULL and a
      // webhook has no admin actor; the payment_session_id reference plus
      // the driver notification form the trail.
      return success(res, null, 'Citation settled');
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

/**
 * GET /payments/return — user-facing result page for Xendit
 * success/cancel redirects. NEVER settles anything; the app refreshes
 * citation status separately after returning.
 */
function returnPage(req, res) {
  const status = req.query.status === 'success' ? 'success' : 'cancelled';
  const title = status === 'success' ? 'Payment submitted' : 'Payment not completed';
  const message = status === 'success'
    ? 'Your payment was submitted to Xendit. Your citation will show as Settled once the payment is confirmed — please return to the app and refresh.'
    : 'No payment was completed. Your citation remains unsettled — you can try again from the app.';
  res.status(200).send(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${title} — DriveTrack</title></head>` +
    `<body style="font-family:sans-serif;max-width:480px;margin:40px auto;padding:0 16px;color:#1A1A1A">` +
    `<h2>${title}</h2><p>${message}</p></body></html>`
  );
}
