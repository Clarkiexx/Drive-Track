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

/** Citations are always read with their violation rows: every payment
 *  decision (amount, allocation, remaining balance) is derived from rows. */
function loadCitation(citationId) {
  return prisma.citation.findUnique({
    where: { citationId },
    include: { violations: true },
  });
}

function unpaidRows(citation) {
  return (citation?.violations || []).filter(paymentSessions.isUnpaidRow);
}

/** Legacy full checkout amount: fine minus whatever rows already settled. */
function legacyRemainingAmount(citation) {
  return Math.max(0, paymentSessions.fineTotal(citation) - paymentSessions.settledPenaltyTotal(citation));
}

/**
 * Normalises the optional `violationIds` body field.
 *   undefined/null  -> legacy full-remaining checkout (no row allocation)
 *   [] / invalid    -> 422
 *   [1, 2]          -> partial checkout for those rows
 */
function parseViolationIds(raw) {
  if (raw === undefined || raw === null) return { legacy: true, ids: null };
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'Select at least one violation to pay.' };
  }
  const ids = [];
  for (const value of raw) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
      return { error: 'violationIds must be an array of positive integers.' };
    }
    ids.push(id);
  }
  if (new Set(ids).size !== ids.length) {
    return { error: 'violationIds must not contain duplicates.' };
  }
  return { legacy: false, ids };
}

/**
 * Validates that every requested id belongs to this citation and is currently
 * payable: unpaid, not allocated to another session, and carrying a positive
 * penalty. Returns `{ selected }` or `{ error, status }`.
 */
function selectViolations(citation, ids) {
  const byId = new Map((citation.violations || []).map((row) => [row.id, row]));
  const selected = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      return { error: 'One or more selected violations do not belong to this citation.', status: 422 };
    }
    if (!paymentSessions.isUnpaidRow(row)) {
      return { error: 'One or more selected violations are already settled.', status: 409 };
    }
    if (row.paymentReference) {
      return { error: 'One or more selected violations are already part of another payment.', status: 409 };
    }
    if (Math.round(toNumber(row.penaltyAtIssuance)) <= 0) {
      return { error: 'One or more selected violations have no payable amount.', status: 422 };
    }
    selected.push(row);
  }
  return { selected };
}

/**
 * Compares the requested set with the rows allocated to the persisted session.
 * Returns the resume payload when they match, otherwise null (409).
 *
 * A legacy session (no allocated rows) covers every currently unpaid row, so
 * it may only be resumed by a request for exactly that set (or by a legacy
 * request, which asks for all unpaid rows).
 */
function resolveActiveRequest(citation, requestedIds, legacyRequest) {
  const reference = citation.paymentReference;
  if (!reference) return null;

  const rows = citation.violations || [];
  const unpaid = unpaidRows(citation);
  const allocated = unpaid.filter((row) => row.paymentReference === reference);
  const allUnpaidIds = unpaid.map((row) => row.id);
  const requested = legacyRequest ? allUnpaidIds : requestedIds;
  const legacySession = allocated.length === 0;
  const target = legacySession ? allUnpaidIds : allocated.map((row) => row.id);

  if (!paymentSessions.sameIdSet(requested, target)) return null;

  const amount = legacySession
    ? legacyRemainingAmount(citation)
    : paymentSessions.sumPenalties(allocated);

  return {
    checkoutUrl: citation.paymentCheckoutUrl,
    paymentSessionId: reference,
    expiresAt: citation.paymentExpiresAt ? new Date(citation.paymentExpiresAt).toISOString() : null,
    resumed: true,
    amount,
    violationIds: legacySession ? [] : allocated.map((row) => row.id),
  };
}

/**
 * Discards a persisted session that Xendit has confirmed is no longer payable
 * (EXPIRED / 404 / successfully cancelled) and releases the unpaid rows it
 * held. Runs under the citation advisory lock so it cannot race a settlement.
 */
async function clearStoredSession(citationId, reference) {
  return prisma.$transaction(async (tx) => {
    await paymentSessions.lockCitation(tx, citationId);
    const cleared = await tx.citation.updateMany({
      where: { citationId, settlementStatus: 'pending' },
      data: {
        paymentReference: null,
        paymentSessionStatus: 'expired',
        paymentCheckoutUrl: null,
        paymentExpiresAt: null,
        paymentLockedAt: null,
      },
    });
    if (cleared.count === 0) return false;
    if (reference) {
      await tx.citationViolation.updateMany({
        where: { citationId, paymentReference: reference, OR: paymentSessions.UNPAID_ROW_OR },
        data: { paymentReference: null },
      });
    }
    return true;
  });
}

/**
 * POST /payments/citations/:id/checkout — driver starts or resumes an online
 * payment. There is exactly ONE active Xendit session per citation:
 *
 *   1. A persisted, unexpired session is returned immediately (any device,
 *      any browser, even if localStorage was cleared) — but only when the
 *      requested violation set matches the one it was created for.
 *   2. A legacy/expired session is verified against Xendit before anything
 *      new is created. If Xendit cannot be reached, the request fails closed
 *      rather than risking a second payable session.
 *   3. Creation is serialised by an atomic conditional UPDATE that claims
 *      `paymentSessionStatus = creating`. Concurrent Pay-Now taps see the
 *      claim and receive the winner's session instead of creating another.
 *
 * Body: optional `{ violationIds: number[] }`. Without it the checkout covers
 * the whole remaining balance (legacy behaviour, no row allocation).
 * Settlement still happens only in the verified webhook/status path.
 */
async function createCheckout(req, res, next) {
  try {
    if (!xendit.isConfigured()) {
      return fail(res, 'Online payments are not configured. Please pay at the CTMO office.', 503);
    }

    const citationId = parseId(req.params.id);
    let citation = citationId === null ? null : await loadCitation(citationId);
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

    const parsedIds = parseViolationIds((req.body || {}).violationIds);
    if (parsedIds.error) return fail(res, parsedIds.error, 422);
    const legacyRequest = parsedIds.legacy;
    const requestedIds = parsedIds.ids;

    // Amount ALWAYS comes from the server-side rows — never the client.
    let amount;
    if (legacyRequest) {
      amount = legacyRemainingAmount(citation);
      if (amount <= 0) return fail(res, 'This citation has no payable amount', 422);
    } else {
      const selection = selectViolations(citation, requestedIds);
      if (selection.error) return fail(res, selection.error, selection.status);
      amount = paymentSessions.sumPenalties(selection.selected);
      if (amount <= 0) return fail(res, 'This citation has no payable amount', 422);
    }

    // 1) Fast path: reuse the persisted session. No Xendit call, no window in
    //    which a slow network can turn a retry into a second session.
    const persisted = paymentSessions.activeCheckout(citation);
    if (persisted) {
      const resume = resolveActiveRequest(citation, requestedIds, legacyRequest);
      if (resume) return success(res, resume, 'Existing payment session resumed');
      return fail(res, 'An unfinished payment exists for other violations. Cancel it first.', 409);
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

    // A pending row without any usable session reference is corrupt/legacy;
    // normalise it so the claim below can replace it. A *real* session that
    // merely lacks a URL is reconciled with Xendit below (never discarded
    // blindly — it might still be payable).
    if (citation.paymentSessionStatus === 'pending' && !hasReference) {
      const cleared = await clearStoredSession(citationId, citation.paymentReference);
      if (!cleared) return fail(res, 'This citation is no longer payable', 409);
      citation = await loadCitation(citationId);
      if (!citation) return fail(res, 'Citation not found', 404);
      if (citation.settlementStatus !== 'pending') {
        return fail(res, 'This citation is no longer payable', 409);
      }
    }

    // 3) Reconcile a session whose stored state is not a usable active one.
    //    This covers legacy rows (status null), sessions whose stored expiry
    //    has passed, and a completed session whose webhook was delayed.
    const shouldLookup =
      paymentSessions.isSessionReference(citation.paymentReference) &&
      (citation.paymentSessionStatus === null ||
        citation.paymentSessionStatus === 'pending' ||
        citation.paymentSessionStatus === 'completed' ||
        (citation.paymentSessionStatus === 'creating' && !citation.paymentLockedAt));

    if (shouldLookup) {
      const sessionReference = citation.paymentReference;
      let session = null;
      let lookupMissing = false;
      try {
        session = await xendit.getPaymentSession(sessionReference);
      } catch (err) {
        if (err.status === 404) {
          lookupMissing = true;
        } else {
          // Fail closed: creating a new session while an old one may still be
          // payable is exactly how a driver gets charged twice.
          console.error('[payments] could not verify existing session:', err.message);
          return fail(res, 'Unable to verify your unfinished payment. Please try again in a moment.', 503);
        }
      }

      if (lookupMissing) {
        const cleared = await clearStoredSession(citationId, sessionReference);
        if (!cleared) return fail(res, 'This citation is no longer payable', 409);
        citation = await loadCitation(citationId);
      } else if (session?.status === 'COMPLETED') {
        const result = await settleOnlineSession(sessionReference);
        if (result.outcome === 'error') return fail(res, result.reason, 502);
        citation = await loadCitation(citationId);
        if (!citation) return fail(res, 'Citation not found', 404);
        if (citation.settlementStatus !== 'pending') {
          if (result.outcome === 'settled') return fail(res, 'This citation is already settled', 409);
          return fail(res, 'This citation cannot be paid', 409);
        }
        if (result.outcome !== 'settled') return fail(res, 'This citation cannot be paid', 409);

        // A partial settlement just changed which rows are payable; re-validate
        // the requested set against the fresh rows before creating anything.
        if (legacyRequest) {
          amount = legacyRemainingAmount(citation);
          if (amount <= 0) return fail(res, 'This citation has no payable amount', 422);
        } else {
          const selection = selectViolations(citation, requestedIds);
          if (selection.error) return fail(res, selection.error, selection.status);
          amount = paymentSessions.sumPenalties(selection.selected);
          if (amount <= 0) return fail(res, 'This citation has no payable amount', 422);
        }
      } else if (session?.status === 'ACTIVE') {
        const resume = resolveActiveRequest(citation, requestedIds, legacyRequest);
        const expiresAt = session.expires_at
          ? new Date(session.expires_at)
          : new Date(Date.now() + paymentSessions.PAYMENT_SESSION_TTL_MS);
        const checkoutUrl = session.payment_link_url || citation.paymentCheckoutUrl;

        if (
          resume &&
          checkoutUrl &&
          Number.isFinite(expiresAt.getTime()) &&
          expiresAt.getTime() > Date.now()
        ) {
          const persistedSession = await prisma.citation.updateMany({
            where: { citationId, settlementStatus: 'pending' },
            data: {
              paymentReference: sessionReference,
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
              await xendit.cancelPaymentSession(sessionReference);
            } catch (cancelErr) {
              console.warn('[payments] could not cancel settled session:', cancelErr.message);
            }
            return fail(res, 'This citation is no longer payable', 409);
          }
          return success(res, {
            ...resume,
            checkoutUrl,
            expiresAt: expiresAt.toISOString(),
          }, 'Existing payment session resumed');
        }

        if (!resume) {
          // A different violation set is already being paid. Never auto-cancel
          // it: the driver must explicitly cancel the unfinished payment.
          return fail(res, 'An unfinished payment exists for other violations. Cancel it first.', 409);
        }

        // Same set but no usable link/expiry: cancel it (fail closed) before
        // replacing it, otherwise two payable sessions would exist.
        try {
          await xendit.cancelPaymentSession(sessionReference);
        } catch (err) {
          if (err.status !== 404) {
            console.error('[payments] could not cancel unusable session:', err.message);
            return fail(res, 'Unable to close the previous payment session. Please try again.', 503);
          }
        }
        const cleared = await clearStoredSession(citationId, sessionReference);
        if (!cleared) return fail(res, 'This citation is no longer payable', 409);
        citation = await loadCitation(citationId);
      } else if (session?.status === 'EXPIRED') {
        const cleared = await clearStoredSession(citationId, sessionReference);
        if (!cleared) return fail(res, 'This citation is no longer payable', 409);
        citation = await loadCitation(citationId);
      } else {
        // Unknown lifecycle state: fail closed rather than risk a second
        // payable session.
        return fail(res, 'Unable to verify your unfinished payment. Please try again in a moment.', 503);
      }

      if (!citation) return fail(res, 'Citation not found', 404);
      if (citation.settlementStatus !== 'pending') {
        return fail(res, 'This citation is no longer payable', 409);
      }
    }

    // 4) Atomically claim the single creation slot. updateMany is the
    //    database-level mutex: only one concurrent request can move the row
    //    into `creating`. `updatedAt` also invalidates a read that raced an
    //    administrator's fine override (which redistributes the rows).
    const attemptKey = crypto.randomUUID();
    const now = new Date();
    const staleLock = new Date(now.getTime() - paymentSessions.PAYMENT_LOCK_MS);
    const claim = await prisma.citation.updateMany({
      where: {
        citationId,
        settlementStatus: 'pending',
        updatedAt: citation.updatedAt,
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
      // Another request won the race, the citation changed state, or an
      // override/settlement bumped updatedAt.
      const current = await loadCitation(citationId);
      if (!current) return fail(res, 'Citation not found', 404);
      if (current.settlementStatus === 'settled') {
        return fail(res, 'This citation is already settled', 409);
      }
      if (current.settlementStatus !== 'pending') {
        return fail(res, 'This citation cannot be paid', 409);
      }
      const existing = paymentSessions.activeCheckout(current);
      if (existing) {
        const resume = resolveActiveRequest(current, requestedIds, legacyRequest);
        if (resume) return success(res, resume, 'Existing payment session resumed');
        return fail(res, 'An unfinished payment exists for other violations. Cancel it first.', 409);
      }
      if (
        current.paymentSessionStatus === 'creating' &&
        current.paymentLockedAt &&
        Date.now() - new Date(current.paymentLockedAt).getTime() < paymentSessions.PAYMENT_LOCK_MS
      ) {
        return fail(res, 'A payment session is already being created. Please wait a moment and try again.', 409);
      }
      return fail(res, 'This citation changed while starting the payment. Please try again.', 409);
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

    // 6) Persist the session and allocate the selected rows atomically. The
    //    advisory lock serialises this against settlement/cancellation/fine
    //    overrides, and the conditional row counts are the final gate.
    class CheckoutAbort extends Error {
      constructor(reason) {
        super(reason);
        this.reason = reason;
      }
    }

    let stored;
    try {
      stored = await prisma.$transaction(async (tx) => {
        await paymentSessions.lockCitation(tx, citationId);

        const fresh = await tx.citation.findUnique({ where: { citationId } });
        if (
          !fresh ||
          fresh.settlementStatus !== 'pending' ||
          fresh.paymentAttemptKey !== attemptKey
        ) {
          throw new CheckoutAbort('state');
        }

        if (!legacyRequest) {
          const allocation = await tx.citationViolation.updateMany({
            where: {
              id: { in: requestedIds },
              citationId,
              paymentReference: null,
              OR: paymentSessions.UNPAID_ROW_OR,
            },
            data: { paymentReference: session.payment_session_id },
          });
          if (allocation.count !== requestedIds.length) throw new CheckoutAbort('rows');
        }

        const updated = await tx.citation.updateMany({
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
        if (updated.count !== 1) throw new CheckoutAbort('state');
        return { ok: true };
      });
    } catch (err) {
      // The session exists but DriveTrack cannot record it (state changed, a
      // row was taken, or the write failed). Cancel it so it cannot be paid
      // unmanaged, release the claim, and let the driver retry. The
      // transaction rolled back, so no partial allocation survives.
      console.error('[payments] could not store session:', err.message);
      try {
        await xendit.cancelPaymentSession(session.payment_session_id);
      } catch (cancelErr) {
        console.error('[payments] could not cancel unrecorded session:', cancelErr.message);
      }
      await prisma.citation.updateMany({
        where: { citationId, paymentAttemptKey: attemptKey },
        data: { paymentSessionStatus: 'failed', paymentLockedAt: null },
      });
      if (err instanceof CheckoutAbort) {
        return fail(
          res,
          'This citation changed while the payment session was being created. Please refresh and try again.',
          409
        );
      }
      return fail(res, 'Unable to save the payment session. Please try again.', 502);
    }

    if (!stored.ok) {
      return fail(res, 'This citation changed while the payment session was being created. Please refresh and try again.', 409);
    }

    return success(res, {
      checkoutUrl: session.payment_link_url,
      paymentSessionId: session.payment_session_id,
      expiresAt: expiresAt.toISOString(),
      resumed: false,
      amount,
      violationIds: legacyRequest ? [] : requestedIds,
    }, 'Payment session created');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /payments/citations/:id/checkout — returns the persisted, unexpired
 * checkout for the driver's citation without contacting Xendit. The receipt
 * uses this on every load so "Resume payment" survives a cleared localStorage
 * or a different device. This endpoint never creates or settles anything.
 */
async function getActiveCheckout(req, res, next) {
  try {
    const citationId = parseId(req.params.id);
    const citation = citationId === null ? null : await loadCitation(citationId);
    if (!citation) return fail(res, 'Citation not found', 404);
    if (citation.driverId !== req.user.id) {
      return fail(res, 'You are not authorized to view this citation', 403);
    }

    const state = paymentSessions.derivePaymentState(citation);
    const active = paymentSessions.activeCheckout(citation);
    if (!active) {
      return success(res, {
        active: false,
        settled: citation.settlementStatus === 'settled',
        ...state,
      }, 'No active payment session');
    }

    const reference = citation.paymentReference;
    const allocated = unpaidRows(citation).filter((row) => row.paymentReference === reference);
    const legacy = allocated.length === 0;
    const violationIds = legacy
      ? unpaidRows(citation).map((row) => row.id)
      : allocated.map((row) => row.id);
    const amount = legacy
      ? legacyRemainingAmount(citation)
      : paymentSessions.sumPenalties(allocated);

    return success(res, {
      active: true,
      settled: false,
      checkoutUrl: active.checkoutUrl,
      paymentSessionId: active.paymentSessionId,
      expiresAt: active.expiresAt,
      amount,
      violationIds,
      legacy,
      ...state,
    }, 'Active payment session found');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /payments/citations/:id/checkout/cancel — driver abandons the current
 * checkout. Fail-closed: the session is verified/cancelled with Xendit before
 * any local state is released, so an old link can never stay payable.
 */
async function cancelCheckout(req, res, next) {
  try {
    const citationId = parseId(req.params.id);
    const citation = citationId === null ? null : await loadCitation(citationId);
    if (!citation) return fail(res, 'Citation not found', 404);
    if (citation.driverId !== req.user.id) {
      return fail(res, 'You are not authorized to cancel this payment', 403);
    }

    if (citation.paymentSessionStatus === 'creating') {
      return fail(res, 'A payment session is being created. Please wait a moment and try again.', 409);
    }

    const active = paymentSessions.activeCheckout(citation);
    if (!active) {
      return success(res, { cancelled: false }, 'No active payment session');
    }

    const sessionId = active.paymentSessionId;

    // Authoritative verification before touching local state.
    let session = null;
    try {
      session = await xendit.getPaymentSession(sessionId);
    } catch (err) {
      if (err.status !== 404) {
        console.error('[payments] could not verify session for cancel:', err.message);
        return fail(res, 'Unable to verify the payment session. Please try again.', 503);
      }
      // 404: the session no longer exists at Xendit; safe to release locally.
    }

    if (session) {
      if (session.status === 'COMPLETED') {
        // The driver already paid. Record it; do NOT clear the allocation.
        const result = await settleOnlineSession(sessionId);
        if (result.outcome === 'error') return fail(res, result.reason, 502);
        return success(res, { cancelled: false, completed: true },
          result.outcome === 'settled'
            ? 'The payment was already completed and has been recorded.'
            : 'The payment was already completed; it is awaiting review.');
      }

      if (session.status === 'ACTIVE') {
        try {
          await xendit.cancelPaymentSession(sessionId);
        } catch (err) {
          if (err.status !== 404) {
            console.error('[payments] could not cancel session:', err.message);
            return fail(res, 'Unable to cancel the payment session. Please try again.', 503);
          }
        }
      } else if (session.status !== 'EXPIRED') {
        return fail(res, 'Unable to verify the payment session. Please try again.', 503);
      }
    }

    const cleared = await prisma.$transaction(async (tx) => {
      await paymentSessions.lockCitation(tx, citationId);

      const updated = await tx.citation.updateMany({
        where: {
          citationId,
          paymentReference: sessionId,
          settlementStatus: 'pending',
        },
        data: {
          paymentReference: null,
          paymentCheckoutUrl: null,
          paymentExpiresAt: null,
          paymentAttemptKey: null,
          paymentLockedAt: null,
          paymentSessionStatus: 'expired',
        },
      });
      if (updated.count === 0) return false;

      // Release unpaid rows only — settled rows keep their reference forever.
      await tx.citationViolation.updateMany({
        where: { citationId, paymentReference: sessionId, OR: paymentSessions.UNPAID_ROW_OR },
        data: { paymentReference: null },
      });
      return true;
    });

    if (!cleared) {
      const current = await loadCitation(citationId);
      if (current?.settlementStatus === 'settled') {
        return success(res, { cancelled: false, completed: true }, 'The payment was already completed.');
      }
      if (current && current.settlementStatus !== 'pending') {
        return success(res, { cancelled: false }, 'The citation can no longer be paid');
      }
      return fail(res, 'This citation changed while cancelling the payment. Please refresh and try again.', 409);
    }

    return success(res, { cancelled: true }, 'Payment session cancelled');
  } catch (err) {
    next(err);
  }
}

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
 * Resolves which unpaid rows a completed session pays for.
 *   a. rows explicitly allocated to this session;
 *   b. the legacy session on the citation -> every unpaid row;
 *   c. orphan fallback -> every *unallocated* unpaid row, but only when the
 *      paid amount matches their sum exactly.
 * Returns null when no safe allocation exists (caller logs CRITICAL).
 */
function resolveAllocation(citation, sessionId, paid) {
  const unpaid = unpaidRows(citation);
  const allocated = unpaid.filter((row) => row.paymentReference === sessionId);
  if (allocated.length > 0) return { rows: allocated, mode: 'allocated' };
  if (citation.paymentReference === sessionId) return { rows: unpaid, mode: 'legacy' };

  const unallocated = unpaid.filter((row) => !row.paymentReference);
  if (unallocated.length > 0 && paymentSessions.sumPenalties(unallocated) === paid) {
    return { rows: unallocated, mode: 'orphan' };
  }
  return null;
}

/** Expected server-side amount for a resolved allocation. */
function expectedAmount(citation, allocation) {
  if (allocation.rows.length > 0) return paymentSessions.sumPenalties(allocation.rows);
  return legacyRemainingAmount(citation);
}

/** Reference constraint for the row-settlement update, per allocation mode. */
function allocationReferenceOr(allocation, sessionId) {
  if (allocation.mode === 'allocated') return [{ paymentReference: sessionId }];
  if (allocation.mode === 'legacy') return [{ paymentReference: null }, { paymentReference: sessionId }];
  return [{ paymentReference: null }];
}

/**
 * Shared settlement core used by the Xendit webhook, the driver status-check
 * endpoint and the driver cancel endpoint. Verifies authoritatively with
 * Xendit (session COMPLETED → payment SUCCEEDED → PHP + exact amount → known
 * channel → citation still pending) and settles only the rows allocated to
 * that session through conditional updateMany row counts.
 *
 * A second delivery for the same session is a no-op. Never throws for
 * business rejections — returns `{ outcome: 'ignored', reason }`; operational
 * failures (Xendit unreachable) return `{ outcome: 'error', reason }` so
 * callers can 502.
 */
async function settleOnlineSession(paymentSessionId) {
  if (!paymentSessionId) {
    console.warn('[payments] completed webhook without payment_session_id');
    return { outcome: 'ignored', reason: 'no session reference' };
  }

  // 1) Authoritative session check — COMPLETED required.
  let session;
  try {
    session = await xendit.getPaymentSession(paymentSessionId);
  } catch (err) {
    console.error('[payments] session lookup failed:', err.message);
    return { outcome: 'error', reason: 'Unable to verify payment session' };
  }
  if (session?.status !== 'COMPLETED') {
    return { outcome: 'ignored', reason: 'session not completed' };
  }

  // 2) Independent payment check — SUCCEEDED required.
  const paymentId = session.payment_id;
  if (!paymentId) {
    console.warn('[payments] completed session without payment_id:', paymentSessionId);
    return { outcome: 'ignored', reason: 'no payment reference' };
  }
  let payment;
  try {
    payment = await xendit.getPayment(paymentId);
  } catch (err) {
    console.error('[payments] payment lookup failed:', err.message);
    return { outcome: 'error', reason: 'Unable to verify payment' };
  }
  if (payment?.status !== 'SUCCEEDED') {
    return { outcome: 'ignored', reason: 'payment not succeeded' };
  }
  if (String(payment.currency || '').toUpperCase() !== 'PHP') {
    console.warn('[payments] non-PHP payment:', payment.currency, paymentSessionId);
    return { outcome: 'ignored', reason: 'currency mismatch' };
  }

  // 3) Correlate to citation via our stable reference prefix.
  const citationId = xendit.parseCitationIdFromReference(session.reference_id);
  if (!citationId) {
    console.warn('[payments] unparseable reference_id:', session.reference_id);
    return { outcome: 'ignored', reason: 'unknown reference' };
  }

  // Cheap pre-checks outside the transaction (the authoritative re-check is
  // inside, under the advisory lock).
  const citation = await loadCitation(citationId);
  if (!citation) {
    console.warn('[payments] citation not found:', citationId);
    return { outcome: 'ignored', reason: 'citation not found' };
  }
  if (citation.settlementStatus !== 'pending') {
    // Duplicate/late event for an already-settled/cancelled record.
    return { outcome: 'ignored', reason: 'citation not pending' };
  }

  const paid = Math.round(Number(payment.request_amount ?? session.amount));
  if (!Number.isFinite(paid)) {
    return { outcome: 'ignored', reason: 'amount mismatch' };
  }

  // Idempotency: if this session already settled any row, a second delivery
  // must not allocate the remaining rows again.
  const alreadySettled = (citation.violations || []).some(
    (row) => row.paymentReference === paymentSessionId && row.settlementStatus === 'settled'
  );
  if (alreadySettled) {
    return { outcome: 'ignored', reason: 'session already settled' };
  }

  // 4) Resolve the allocation and compare the verified amount exactly.
  const allocation = resolveAllocation(citation, paymentSessionId, paid);
  if (!allocation) {
    console.error('[payments][CRITICAL] orphan payment: no allocation matches', {
      citationId,
      paymentSessionId,
      paid,
      unpaid: unpaidRows(citation).map((row) => ({
        id: row.id,
        penalty: toNumber(row.penaltyAtIssuance),
        reference: row.paymentReference,
      })),
    });
    return { outcome: 'ignored', reason: 'orphan payment' };
  }
  if (allocation.mode === 'orphan') {
    console.error('[payments][CRITICAL] orphan payment matched all unallocated unpaid rows', {
      citationId,
      paymentSessionId,
      paid,
      rowIds: allocation.rows.map((row) => row.id),
    });
  }

  const expected = expectedAmount(citation, allocation);
  if (paid !== expected) {
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
    console.warn('[payments] unknown channel_code:', channelCode, paymentSessionId);
    return { outcome: 'ignored', reason: 'unknown channel' };
  }

  // 6) Settle under the citation advisory lock. Everything is re-read and
  //    re-resolved; conditional row counts are the final idempotency gate.
  let outcome;
  try {
    outcome = await prisma.$transaction(async (tx) => {
      await paymentSessions.lockCitation(tx, citationId);

      const fresh = await tx.citation.findUnique({
        where: { citationId },
        include: { violations: true },
      });
      if (!fresh || fresh.settlementStatus !== 'pending') {
        return { status: 'ignored', reason: 'citation not pending' };
      }
      if (
        (fresh.violations || []).some(
          (row) => row.paymentReference === paymentSessionId && row.settlementStatus === 'settled'
        )
      ) {
        return { status: 'ignored', reason: 'session already settled' };
      }

      const freshAllocation = resolveAllocation(fresh, paymentSessionId, paid);
      if (!freshAllocation) {
        return { status: 'ignored', reason: 'orphan payment' };
      }
      const freshExpected = expectedAmount(fresh, freshAllocation);
      if (paid !== freshExpected) {
        return { status: 'ignored', reason: 'amount mismatch' };
      }

      const rowIds = freshAllocation.rows.map((row) => row.id);
      const now = new Date();
      if (rowIds.length > 0) {
        const settledRows = await tx.citationViolation.updateMany({
          where: {
            id: { in: rowIds },
            citationId,
            AND: [
              { OR: allocationReferenceOr(freshAllocation, paymentSessionId) },
              { OR: paymentSessions.UNPAID_ROW_OR },
            ],
          },
          data: {
            settlementStatus: 'settled',
            settledAt: now,
            paymentMethod: method,
            paymentReference: paymentSessionId,
          },
        });
        if (settledRows.count !== rowIds.length) {
          // A concurrent mutation slipped through: roll back and no-op.
          throw new Error('row settlement count mismatch');
        }
      }

      const remainingRows = await tx.citationViolation.findMany({
        where: { citationId, OR: paymentSessions.UNPAID_ROW_OR },
        select: { id: true },
      });
      const fullySettled = remainingRows.length === 0;

      if (fullySettled) {
        const updated = await tx.citation.updateMany({
          where: { citationId, settlementStatus: 'pending' },
          data: {
            settlementStatus: 'settled',
            settledAt: now,
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
        if (updated.count !== 1) throw new Error('citation settlement count mismatch');

        await notifyDriver(
          {
            driverId: fresh.driverId,
            citationId: fresh.citationId,
            message: `Your online payment for citation ${fresh.citationNumber} has been confirmed. Thank you!`,
            notificationType: 'settlement_confirmed',
          },
          { transaction: tx }
        );
      } else {
        // Partial payment: the citation stays pending and its active-session
        // fields are cleared. Settled rows keep their own method/reference.
        const updated = await tx.citation.updateMany({
          where: { citationId, settlementStatus: 'pending' },
          data: {
            paymentSessionStatus: 'expired',
            paymentCheckoutUrl: null,
            paymentExpiresAt: null,
            paymentAttemptKey: null,
            paymentLockedAt: null,
            paymentReference: null,
            paymentMethod: null,
          },
        });
        if (updated.count !== 1) throw new Error('citation partial settlement count mismatch');

        const settledAggregate = await tx.citationViolation.aggregate({
          where: { citationId, settlementStatus: 'settled' },
          _sum: { penaltyAtIssuance: true },
        });
        const paidSoFar = Math.round(toNumber(settledAggregate._sum.penaltyAtIssuance));
        const remainingAmount = Math.max(0, paymentSessions.fineTotal(fresh) - paidSoFar);

        await notifyDriver(
          {
            driverId: fresh.driverId,
            citationId: fresh.citationId,
            message: `Your online payment of ₱${paid.toLocaleString()} for citation ${fresh.citationNumber} has been confirmed. Remaining balance: ₱${remainingAmount.toLocaleString()}.`,
            notificationType: 'settlement_confirmed',
          },
          { transaction: tx }
        );

        return {
          status: 'settled',
          partial: true,
          paidAmount: paidSoFar,
          remainingAmount,
        };
      }

      return {
        status: 'settled',
        partial: false,
        paidAmount: paymentSessions.fineTotal(fresh),
        remainingAmount: 0,
      };
    });
  } catch (err) {
    console.error('[payments] settlement transaction failed:', err.message);
    return { outcome: 'ignored', reason: 'settlement race' };
  }

  if (outcome.status !== 'settled') {
    return { outcome: 'ignored', reason: outcome.reason };
  }

  // A late payment from an older session can win the race while a newer
  // session is still active. Re-read after commit and invalidate only a
  // *different* session (never the one that just settled). Partial
  // settlements skip this: a session for the remaining rows is legitimate.
  if (!outcome.partial) {
    const current = await prisma.citation.findUnique({
      where: { citationId },
      select: { paymentReference: true, paymentSessionStatus: true },
    });
    if (
      current?.paymentReference &&
      current.paymentReference !== paymentSessionId &&
      current.paymentSessionStatus === 'pending' &&
      paymentSessions.isSessionReference(current.paymentReference)
    ) {
      try {
        await xendit.cancelPaymentSession(current.paymentReference);
      } catch (err) {
        console.warn('[payments] could not cancel superseded session:', err.message);
      }
    }
  }

  // NOTE: no audit-log row here — AuditLog.admin_id is NOT NULL and an
  // online payment has no admin actor; the payment_session_id reference
  // plus the driver notification form the trail.
  return {
    outcome: 'settled',
    partial: Boolean(outcome.partial),
    paidAmount: outcome.paidAmount,
    remainingAmount: outcome.remainingAmount,
  };
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
      return success(res, null, result.partial ? 'Partial payment recorded' : 'Citation settled');
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
 * GET /payments/citations/:id/status — driver re-verifies their own pending
 * citation against Xendit (covers webhook outage/delay: the driver returning
 * from hosted checkout triggers this on tab focus). Settles through the same
 * gated core when the payment completed; otherwise returns settled:false so
 * the app just refreshes and keeps showing pending. Paid/remaining amounts
 * are always derived from the violation rows.
 */
async function getCheckoutStatus(req, res, next) {
  try {
    const citationId = parseId(req.params.id);
    const citation = citationId === null ? null : await loadCitation(citationId);
    if (!citation) return fail(res, 'Citation not found', 404);

    // A driver may only check their own citation.
    if (citation.driverId !== req.user.id) {
      return fail(res, 'You are not authorized to view this citation', 403);
    }

    const state = paymentSessions.derivePaymentState(citation);
    if (citation.settlementStatus === 'settled') {
      return success(res, { settled: true, ...state }, 'Citation already settled');
    }
    if (citation.settlementStatus !== 'pending') {
      return success(res, { settled: false, ...state }, 'Citation cannot be paid');
    }
    if (!paymentSessions.isSessionReference(citation.paymentReference)) {
      return success(res, { settled: false, ...state }, 'No online session to verify');
    }

    const now = Date.now();
    const last = lastStatusAt.get(citationId);
    if (last && now - last < STATUS_THROTTLE_MS) {
      return success(res, { settled: false, ...state }, 'Verification requested too recently');
    }
    lastStatusAt.set(citationId, now);

    const result = await settleOnlineSession(citation.paymentReference);
    if (result.outcome === 'error') {
      return fail(res, result.reason, 502);
    }

    const fresh = await loadCitation(citationId);
    const freshState = paymentSessions.derivePaymentState(fresh || citation);
    if (result.outcome === 'settled') {
      const fullySettled = fresh?.settlementStatus === 'settled';
      return success(res, {
        settled: fullySettled,
        paymentRecorded: true,
        ...freshState,
      }, fullySettled ? 'Citation settled' : 'Partial payment recorded');
    }
    return success(res, { settled: false, ...freshState }, `Not settled: ${result.reason}`);
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

module.exports = {
  createCheckout,
  getActiveCheckout,
  cancelCheckout,
  getCheckoutStatus,
  handleWebhook,
  returnPage,
  // Exported for verification/testing.
  _helpers: {
    verifyCallbackToken,
    isCompletedEvent,
    mapChannelToMethod,
    settleOnlineSession,
    parseViolationIds,
    selectViolations,
    resolveAllocation,
    expectedAmount,
    legacyRemainingAmount,
  },
};
