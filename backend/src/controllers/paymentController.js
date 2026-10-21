const crypto = require('crypto');
// Shared Prisma data layer — `src/lib/prisma.js` is the single place the
// client and the error/date/number helpers come from.
const { prisma, prismaErrorToHttp, toDateOnlyString, toNumber } = require('../lib/prisma');
const { success, fail } = require('../utils/response');
const { notifyDriver } = require('../services/notificationService');
const xendit = require('../services/xenditService');

/**
 * `:id` params: MySQL coerced non-numeric ids (findByPk('abc') -> row id 0),
 * while Prisma rejects them with a validation error. Parse first so the
 * original "Citation not found" 404 path is preserved. '12abc' -> 12, like MySQL.
 */
function parseId(value) {
  const id = parseInt(value, 10);
  return Number.isInteger(id) ? id : null;
}

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

    const citationId = parseId(req.params.id);
    const citation = citationId === null
      ? null
      : await prisma.citation.findUnique({ where: { citationId } });
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
    // fineAmount is a Prisma Decimal; toNumber() coerces it like the old
    // Sequelize DECIMAL value did (null/absent still lands in the 422 below).
    const amount = Math.round(toNumber(citation.fineAmount));
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

    // Remember the live session on the citation so a later status check can
    // reconcile (webhook outage, delayed delivery). paymentReference is only
    // displayed once settled, and settling overwrites it with the same id —
    // bookkeeping only, never settlement. Failures here must not block the
    // checkout URL the driver is waiting for.
    try {
      await prisma.citation.update({
        where: { citationId: citation.citationId },
        data: { paymentReference: session.payment_session_id },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[payments] could not store session reference:', err.message);
    }

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
  getCheckoutStatus,
  handleWebhook,
  returnPage,
  // Exported for verification/testing; webhook + return page land in 4.2.
  _throttle: { isThrottled, markCheckout, CHECKOUT_THROTTLE_MS },
  _helpers: { verifyCallbackToken, isCompletedEvent, mapChannelToMethod, settleOnlineSession },
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
 * Known channels get a specific value; any other non-empty code (e.g.
 * GrabPay, ShopeePay, a new e-wallet label) uses the catch-all 'other'.
 * Returns null only when Xendit supplied no channel code at all.
 *
 * The payment itself has already been verified as SUCCEEDED with the exact
 * amount and currency — the channel is display metadata, so an unfamiliar
 * label must never leave a paid citation pending.
 */
function mapChannelToMethod(channelCode) {
  const code = String(channelCode || '').toUpperCase().trim();
  if (code === 'GCASH') return 'gcash';
  if (code === 'MAYA' || code === 'PAYMAYA') return 'maya';
  if (code === 'CARDS') return 'other';
  // Bank-transfer VA-style codes (e.g. BPI_VA, BNI_VA) and explicit
  // BANK_TRANSFER map to bank.
  if (code === 'BANK_TRANSFER' || code.includes('BANK') || /_VA$/.test(code)) return 'bank';
  return code ? 'other' : null;
}

/**
 * Shared settlement core used by BOTH the Xendit webhook and the driver
 * status-check endpoint. Verifies authoritatively with Xendit (session
 * COMPLETED → payment SUCCEEDED → PHP + exact amount → known channel →
 * citation still pending) and settles through the conditional updateMany
 * concurrency gate. Never throws for business rejections — returns
 * `{ outcome: 'ignored', reason }`; operational failures (Xendit
 * unreachable) return `{ outcome: 'error', reason }` so callers can 502.
 */
async function settleOnlineSession(paymentSessionId) {
  if (!paymentSessionId) {
    // eslint-disable-next-line no-console
    console.warn('[payments] completed webhook without payment_session_id');
    return { outcome: 'ignored', reason: 'no session reference' };
  }

  // 1) Authoritative session check — COMPLETED required.
  let session;
  try {
    session = await xendit.getPaymentSession(paymentSessionId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[payments] session lookup failed:', err.message);
    return { outcome: 'error', reason: 'Unable to verify payment session' };
  }
  if (session?.status !== 'COMPLETED') {
    return { outcome: 'ignored', reason: 'session not completed' };
  }

  // 2) Independent payment check — SUCCEEDED required.
  const paymentId = session.payment_id;
  if (!paymentId) {
    // eslint-disable-next-line no-console
    console.warn('[payments] completed session without payment_id:', paymentSessionId);
    return { outcome: 'ignored', reason: 'no payment reference' };
  }
  let payment;
  try {
    payment = await xendit.getPayment(paymentId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[payments] payment lookup failed:', err.message);
    return { outcome: 'error', reason: 'Unable to verify payment' };
  }
  if (payment?.status !== 'SUCCEEDED') {
    return { outcome: 'ignored', reason: 'payment not succeeded' };
  }
  if (String(payment.currency || '').toUpperCase() !== 'PHP') {
    // eslint-disable-next-line no-console
    console.warn('[payments] non-PHP payment:', payment.currency, paymentSessionId);
    return { outcome: 'ignored', reason: 'currency mismatch' };
  }

  // 3) Correlate to citation via our stable reference prefix.
  const citationId = xendit.parseCitationIdFromReference(session.reference_id);
  if (!citationId) {
    // eslint-disable-next-line no-console
    console.warn('[payments] unparseable reference_id:', session.reference_id);
    return { outcome: 'ignored', reason: 'unknown reference' };
  }

  // Prisma has no SELECT ... FOR UPDATE: read the row first (cheap
  // pre-checks) and then settle through a conditional updateMany whose
  // affected-row count is the concurrency gate — exactly one caller can
  // move the row out of 'pending'.
  const citation = await prisma.citation.findUnique({ where: { citationId } });
  if (!citation) {
    // eslint-disable-next-line no-console
    console.warn('[payments] citation not found:', citationId);
    return { outcome: 'ignored', reason: 'citation not found' };
  }
  if (citation.settlementStatus !== 'pending') {
    // Duplicate/late event for an already-settled/cancelled record.
    return { outcome: 'ignored', reason: 'citation not pending' };
  }

  // 4) Exact amount match against the server-side fine.
  const expected = Math.round(toNumber(citation.fineAmount));
  const paid = Math.round(Number(payment.request_amount ?? session.amount));
  if (!Number.isFinite(paid) || paid !== expected) {
    // eslint-disable-next-line no-console
    console.warn('[payments] amount mismatch:', { citationId, expected, paid });
    return { outcome: 'ignored', reason: 'amount mismatch' };
  }

  // 5) Known channel only — never guess.
  const method = mapChannelToMethod(payment.channel_code);
  if (!method) {
    // eslint-disable-next-line no-console
    console.warn('[payments] unknown channel_code:', payment.channel_code, paymentSessionId);
    return { outcome: 'ignored', reason: 'unknown channel' };
  }

  const settled = await prisma.$transaction(async (tx) => {
    // The WHERE clause re-checks `settlementStatus: 'pending'`, so a
    // concurrent/late caller matches 0 rows and becomes a no-op instead
    // of double-settling the citation.
    const { count } = await tx.citation.updateMany({
      where: { citationId, settlementStatus: 'pending' },
      data: {
        settlementStatus: 'settled',
        settledAt: new Date(),
        paymentMethod: method,
        paymentReference: paymentSessionId,
        receivedBy: null, // online payment — no admin/staff handler
      },
    });
    if (count === 0) return false;

    await notifyDriver(
      {
        driverId: citation.driverId,
        citationId: citation.citationId,
        message: `Your online payment for citation ${citation.citationNumber} has been confirmed. Thank you!`,
        notificationType: 'settlement_confirmed',
      },
      { transaction: tx }
    );
    return true;
  });

  if (!settled) {
    return { outcome: 'ignored', reason: 'citation not pending' };
  }
  // NOTE: no audit-log row here — AuditLog.admin_id is NOT NULL and an
  // online payment has no admin actor; the payment_session_id reference
  // plus the driver notification form the trail.
  return { outcome: 'settled' };
}

/**
 * POST /payments/webhook — Xendit session/payment event receiver.
 * Public route: authorized by the x-callback-token header, NOT user JWT.
 * Settles ONLY via settleOnlineSession; everything else is a safe 200
 * no-op so Xendit stops retrying.
 */
async function handleWebhook(req, res, next) {
  try {
    if (!verifyCallbackToken(req)) {
      return fail(res, 'Invalid webhook token', 401);
    }

    const { event, data = {} } = req.body || {};
    if (!isCompletedEvent(event)) {
      // Expired event: acknowledge, change nothing. (expired is the only
      // other session event Xendit sends.)
      return success(res, null, `Ignored event ${event || 'unknown'}`);
    }

    const result = await settleOnlineSession(data.payment_session_id);
    if (result.outcome === 'settled') {
      return success(res, null, 'Citation settled');
    }
    if (result.outcome === 'error') {
      return fail(res, result.reason, 502);
    }
    return success(res, null, `Ignored: ${result.reason}`);
  } catch (err) {
    next(err);
  }
}

// Reconcile throttle (15s per citation): status checks hit Xendit's API, so
// tab-focus storms must not fan out. Separate from the checkout throttle so
// checking never blocks creating.
const STATUS_THROTTLE_MS = 15 * 1000;
const lastStatusAt = new Map();

/** Xendit session ids look like `ps-<alphanumeric>` — never trust a manual reference. */
function isSessionReference(value) {
  return /^ps-[A-Za-z0-9]+$/.test(String(value || ''));
}

/**
 * GET /payments/citations/:id/status — driver re-verifies their own pending
 * citation against Xendit (covers webhook outage/delay: the driver returning
 * from hosted checkout triggers this on tab focus). Settles through the same
 * gated core when the payment completed; otherwise returns settled:false so
 * the app just refreshes and keeps showing pending.
 */
async function getCheckoutStatus(req, res, next) {
  try {
    const citationId = parseId(req.params.id);
    const citation = citationId === null
      ? null
      : await prisma.citation.findUnique({ where: { citationId } });
    if (!citation) return fail(res, 'Citation not found', 404);

    // A driver may only check their own citation.
    if (citation.driverId !== req.user.id) {
      return fail(res, 'You are not authorized to view this citation', 403);
    }
    if (citation.settlementStatus === 'settled') {
      return success(res, { settled: true }, 'Citation already settled');
    }
    if (citation.settlementStatus !== 'pending') {
      return success(res, { settled: false }, 'Citation cannot be paid');
    }
    if (!isSessionReference(citation.paymentReference)) {
      return success(res, { settled: false }, 'No online session to verify');
    }

    const now = Date.now();
    const last = lastStatusAt.get(citationId);
    if (last && now - last < STATUS_THROTTLE_MS) {
      return success(res, { settled: false }, 'Verification requested too recently');
    }
    lastStatusAt.set(citationId, now);

    const result = await settleOnlineSession(citation.paymentReference);
    if (result.outcome === 'settled') {
      return success(res, { settled: true }, 'Citation settled');
    }
    if (result.outcome === 'error') {
      return fail(res, result.reason, 502);
    }
    return success(res, { settled: false }, `Not settled: ${result.reason}`);
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
