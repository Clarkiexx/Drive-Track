const crypto = require('crypto');
// Shared Prisma data layer — `src/lib/prisma.js` is the single place the
// client and the error/date/number helpers come from.
const { prisma, prismaErrorToHttp, toDateOnlyString, toNumber } = require('../lib/prisma');
const { success, fail } = require('../utils/response');
const { notifyDriver } = require('../services/notificationService');
const xendit = require('../services/xenditService');
const paymentSessions = require('../services/paymentSessionService');

/**
 * `:id` params: MySQL coerced non-numeric ids (findByPk('abc') -> row id 0),
 * while Prisma rejects them with a validation error. Parse first so the
 * original "Citation not found" 404 path is preserved. '12abc' -> 12, like MySQL.
 */
function parseId(value) {
  const id = parseInt(value, 10);
  return Number.isInteger(id) ? id : null;
}

/**
 * POST /payments/citations/:id/checkout — driver starts or resumes an online
 * payment. There is exactly ONE active Xendit session per citation:
 *
 *   1. A persisted, unexpired session is returned immediately (any device,
 *      any browser, even if localStorage was cleared).
 *   2. A legacy/expired session is verified against Xendit before anything
 *      new is created. If Xendit cannot be reached, the request fails closed
 *      rather than risking a second payable session.
 *   3. Creation is serialised by an atomic conditional UPDATE that claims
 *      `paymentSessionStatus = creating`. Concurrent Pay-Now taps see the
 *      claim and receive the winner's session instead of creating another.
 *
 * Settlement still happens only in the verified webhook/status path.
 */
async function createCheckout(req, res, next) {
  try {
    if (!xendit.isConfigured()) {
      return fail(res, 'Online payments are not configured. Please pay at the CTMO office.', 503);
    }

    const citationId = parseId(req.params.id);
    let citation = citationId === null
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

    // 1) Fast path: reuse the persisted session. No Xendit call, no window in
    //    which a slow network can turn a retry into a second session.
    const persisted = paymentSessions.activeCheckout(citation);
    if (persisted) {
      return success(res, { ...persisted, resumed: true }, 'Existing payment session resumed');
    }

    // 2) A `creating` claim younger than the lock window belongs to another
    //    request that is already talking to Xendit.
    if (
      citation.paymentSessionStatus === 'creating' &&
      citation.paymentLockedAt &&
      Date.now() - new Date(citation.paymentLockedAt).getTime() < paymentSessions.PAYMENT_LOCK_MS
    ) {
      return fail(res, 'A payment session is already being created. Please wait a moment and try again.', 409);
    }

    const hasReference = paymentSessions.isSessionReference(citation.paymentReference);
    const status = citation.paymentSessionStatus;

    // A pending row without a usable reference/URL is corrupt or legacy;
    // normalise it so the claim below can replace it. The conditional WHERE
    // ensures a concurrent settlement is never overwritten.
    if (status === 'pending' && (!hasReference || !citation.paymentCheckoutUrl)) {
      const normalised = await prisma.citation.updateMany({
        where: { citationId, settlementStatus: 'pending' },
        data: {
          paymentSessionStatus: 'expired',
          paymentCheckoutUrl: null,
          paymentExpiresAt: null,
          paymentLockedAt: null,
        },
      });
      if (normalised.count === 0) {
        return fail(res, 'This citation is no longer payable', 409);
      }
      citation = await prisma.citation.findUnique({ where: { citationId } });
      if (!citation) return fail(res, 'Citation not found', 404);
    }

    // 3) Reconcile a session whose stored state is not a usable active one.
    //    This covers legacy rows (status null), sessions whose stored expiry
    //    has passed, and a completed session whose webhook was delayed.
    const shouldLookup =
      hasReference &&
      (citation.paymentSessionStatus === null ||
        citation.paymentSessionStatus === 'pending' ||
        citation.paymentSessionStatus === 'completed' ||
        (citation.paymentSessionStatus === 'creating' && !citation.paymentLockedAt));

    if (shouldLookup) {
      let session;
      try {
        session = await xendit.getPaymentSession(citation.paymentReference);
      } catch (err) {
        if (err.status === 404) {
          // A legacy reference that no longer exists in Xendit cannot be paid;
          // normalise it to expired and let the claim below create a fresh
          // session. All other failures (network, auth, 5xx) fail closed.
          const normalised = await prisma.citation.updateMany({
            where: { citationId, settlementStatus: 'pending' },
            data: {
              paymentSessionStatus: 'expired',
              paymentCheckoutUrl: null,
              paymentExpiresAt: null,
              paymentLockedAt: null,
            },
          });
          if (normalised.count === 0) {
            return fail(res, 'This citation is no longer payable', 409);
          }
        } else {
          // Fail closed: creating a new session while an old one may still be
          // payable is exactly how a driver gets charged twice.
          // eslint-disable-next-line no-console
          console.error('[payments] could not verify existing session:', err.message);
          return fail(res, 'Unable to verify your unfinished payment. Please try again in a moment.', 503);
        }
      }

      if (session?.status === 'COMPLETED') {
        const result = await settleOnlineSession(citation.paymentReference);
        if (result.outcome === 'settled') {
          return fail(res, 'This citation is already settled', 409);
        }
        if (result.outcome === 'error') {
          return fail(res, result.reason, 502);
        }
        return fail(res, 'This citation cannot be paid', 409);
      }

      if (session?.status === 'ACTIVE') {
        const expiresAt = session.expires_at
          ? new Date(session.expires_at)
          : new Date(Date.now() + paymentSessions.PAYMENT_SESSION_TTL_MS);
        const checkoutUrl = session.payment_link_url || citation.paymentCheckoutUrl;
        if (
          checkoutUrl &&
          Number.isFinite(expiresAt.getTime()) &&
          expiresAt.getTime() > Date.now()
        ) {
          const persistedSession = await prisma.citation.updateMany({
            where: { citationId, settlementStatus: 'pending' },
            data: {
              paymentReference: citation.paymentReference,
              paymentCheckoutUrl: checkoutUrl,
              paymentExpiresAt: expiresAt,
              paymentSessionStatus: 'pending',
              paymentLockedAt: null,
            },
          });
          if (persistedSession.count === 0) {
            // The citation was settled/cancelled while we verified the
            // session. Invalidate it so the driver cannot pay it too.
            try {
              await xendit.cancelPaymentSession(citation.paymentReference);
            } catch (cancelErr) {
              // eslint-disable-next-line no-console
              console.warn('[payments] could not cancel settled session:', cancelErr.message);
            }
            return fail(res, 'This citation is no longer payable', 409);
          }
          return success(res, {
            checkoutUrl,
            paymentSessionId: citation.paymentReference,
            expiresAt: expiresAt.toISOString(),
            resumed: true,
          }, 'Existing payment session resumed');
        }

        // ACTIVE but unusable (no link or past expiry): invalidate it before
        // replacing it, otherwise two payable sessions would exist.
        try {
          await xendit.cancelPaymentSession(citation.paymentReference);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[payments] could not cancel unusable session:', err.message);
        }
      }

      const cleared = await prisma.citation.updateMany({
        where: { citationId, settlementStatus: 'pending' },
        data: {
          paymentSessionStatus: 'expired',
          paymentCheckoutUrl: null,
          paymentExpiresAt: null,
          paymentLockedAt: null,
        },
      });
      if (cleared.count === 0) {
        return fail(res, 'This citation is no longer payable', 409);
      }
    }

    // 4) Atomically claim the single creation slot. updateMany is the
    //    database-level mutex: only one concurrent request can move the row
    //    into `creating`.
    const attemptKey = crypto.randomUUID();
    const now = new Date();
    const staleLock = new Date(now.getTime() - paymentSessions.PAYMENT_LOCK_MS);
    const claim = await prisma.citation.updateMany({
      where: {
        citationId,
        settlementStatus: 'pending',
        OR: [
          { paymentSessionStatus: null },
          { paymentSessionStatus: 'expired' },
          { paymentSessionStatus: 'failed' },
          { paymentSessionStatus: 'pending', paymentExpiresAt: null },
          { paymentSessionStatus: 'pending', paymentExpiresAt: { lte: now } },
          { paymentSessionStatus: 'creating', paymentLockedAt: null },
          { paymentSessionStatus: 'creating', paymentLockedAt: { lt: staleLock } },
        ],
      },
      data: {
        paymentSessionStatus: 'creating',
        paymentAttemptKey: attemptKey,
        paymentLockedAt: now,
      },
    });

    if (claim.count === 0) {
      // Another request won the race, or the citation changed state.
      const current = await prisma.citation.findUnique({ where: { citationId } });
      if (!current) return fail(res, 'Citation not found', 404);
      if (current.settlementStatus === 'settled') {
        return fail(res, 'This citation is already settled', 409);
      }
      if (current.settlementStatus !== 'pending') {
        return fail(res, 'This citation cannot be paid', 409);
      }
      const existing = paymentSessions.activeCheckout(current);
      if (existing) {
        return success(res, { ...existing, resumed: true }, 'Existing payment session resumed');
      }
      return fail(res, 'A payment session is already being created. Please wait a moment and try again.', 409);
    }

    // 5) Create the Xendit session outside any database transaction.
    let session;
    try {
      session = await xendit.createPaymentSession({
        citationId,
        citationNumber: citation.citationNumber,
        amount,
        idempotencyKey: attemptKey,
      });
    } catch (err) {
      await prisma.citation.updateMany({
        where: { citationId, paymentAttemptKey: attemptKey },
        data: { paymentSessionStatus: 'failed', paymentLockedAt: null },
      });
      throw err;
    }

    if (!session?.payment_link_url || !session?.payment_session_id) {
      await prisma.citation.updateMany({
        where: { citationId, paymentAttemptKey: attemptKey },
        data: { paymentSessionStatus: 'failed', paymentLockedAt: null },
      });
      return fail(res, 'Unable to start the payment session. Please try again.', 502);
    }

    const expiresAt = session.expires_at
      ? new Date(session.expires_at)
      : new Date(Date.now() + paymentSessions.PAYMENT_SESSION_TTL_MS);

    let stored;
    try {
      stored = await prisma.citation.updateMany({
        where: { citationId, settlementStatus: 'pending', paymentAttemptKey: attemptKey },
        data: {
          paymentReference: session.payment_session_id,
          paymentCheckoutUrl: session.payment_link_url,
          paymentExpiresAt: expiresAt,
          paymentSessionStatus: 'pending',
          paymentAttemptKey: null,
          paymentLockedAt: null,
        },
      });
    } catch (err) {
      // The session exists but DriveTrack cannot record it. Cancel it so it
      // cannot be paid unmanaged, release the claim, and let the driver retry.
      // eslint-disable-next-line no-console
      console.error('[payments] could not store session:', err.message);
      try {
        await xendit.cancelPaymentSession(session.payment_session_id);
      } catch (cancelErr) {
        // eslint-disable-next-line no-console
        console.warn('[payments] could not cancel unrecorded session:', cancelErr.message);
      }
      await prisma.citation.updateMany({
        where: { citationId, paymentAttemptKey: attemptKey },
        data: { paymentSessionStatus: 'failed', paymentLockedAt: null },
      });
      return fail(res, 'Unable to save the payment session. Please try again.', 502);
    }

    if (stored.count === 0) {
      // The citation was settled/cancelled (or another stale claim took over)
      // while Xendit was creating this session. Cancel it so it cannot be
      // paid outside the citation's current state.
      try {
        await xendit.cancelPaymentSession(session.payment_session_id);
      } catch (cancelErr) {
        // eslint-disable-next-line no-console
        console.warn('[payments] could not cancel superseded new session:', cancelErr.message);
      }
      return fail(res, 'This citation changed while the payment session was being created. Please refresh and try again.', 409);
    }

    return success(res, {
      checkoutUrl: session.payment_link_url,
      paymentSessionId: session.payment_session_id,
      expiresAt: expiresAt.toISOString(),
      resumed: false,
    }, 'Payment session created');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createCheckout,
  getActiveCheckout,
  getCheckoutStatus,
  handleWebhook,
  returnPage,
  // Exported for verification/testing.
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

  // 5) Known channel only — never guess. Some Xendit responses put the
  //    channel on the session instead of the payment, so check both. A
  //    non-empty unknown code still maps to 'other'; only an entirely empty
  //    channel is rejected.
  const channelCode = payment.channel_code || session.channel_code;
  const method = mapChannelToMethod(channelCode);
  if (!method) {
    // eslint-disable-next-line no-console
    console.warn('[payments] unknown channel_code:', channelCode, paymentSessionId);
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
        paymentSessionStatus: 'completed',
        paymentCheckoutUrl: null,
        paymentExpiresAt: null,
        paymentAttemptKey: null,
        paymentLockedAt: null,
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

  // A late payment from an older session can win the race while a newer
  // session is still active (only possible for rows created before the
  // single-session claim existed). Invalidate the newer one so the driver
  // cannot be charged twice.
  if (
    citation.paymentReference &&
    citation.paymentReference !== paymentSessionId &&
    citation.paymentSessionStatus === 'pending' &&
    paymentSessions.isSessionReference(citation.paymentReference)
  ) {
    try {
      await xendit.cancelPaymentSession(citation.paymentReference);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[payments] could not cancel superseded session:', err.message);
    }
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
// tab-focus storms must not fan out. Checkout creation has its own database
// claim and is deliberately not throttled here.
const STATUS_THROTTLE_MS = 15 * 1000;
const lastStatusAt = new Map();

/**
 * GET /payments/citations/:id/checkout — returns the persisted, unexpired
 * checkout for the driver's citation without contacting Xendit. The receipt
 * uses this on every load so "Resume payment" survives a cleared localStorage
 * or a different device. This endpoint never creates or settles anything.
 */
async function getActiveCheckout(req, res, next) {
  try {
    const citationId = parseId(req.params.id);
    const citation = citationId === null
      ? null
      : await prisma.citation.findUnique({ where: { citationId } });
    if (!citation) return fail(res, 'Citation not found', 404);
    if (citation.driverId !== req.user.id) {
      return fail(res, 'You are not authorized to view this citation', 403);
    }

    const active = paymentSessions.activeCheckout(citation);
    if (!active) {
      return success(res, {
        active: false,
        settled: citation.settlementStatus === 'settled',
      }, 'No active payment session');
    }
    return success(res, { active: true, ...active }, 'Active payment session found');
  } catch (err) {
    next(err);
  }
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
    if (!paymentSessions.isSessionReference(citation.paymentReference)) {
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
