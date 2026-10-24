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

/**
 * Serialises every payment-state mutation for one citation. `pg_advisory_xact_lock`
 * is held until the surrounding interactive transaction commits/rolls back, so
 * checkout allocation, online settlement, offline settlement, cancellation and
 * fine overrides cannot interleave. The database is Postgres/Neon.
 */
async function lockCitation(tx, citationId) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${citationId})`;
}

/** Coerces a Prisma Decimal / numeric string to a finite number. */
function toFiniteNumber(value) {
  if (value === null || value === undefined) return 0;
  const n = Number(typeof value === 'number' ? value : value.toString());
  return Number.isFinite(n) ? n : 0;
}

/**
 * `NULL` settlement_status is the legacy "unpaid" representation; `pending`
 * is the explicit unpaid value written by newer code.
 */
function isUnpaidRow(row) {
  if (!row) return false;
  return row.settlementStatus === null || row.settlementStatus === undefined || row.settlementStatus === 'pending';
}

/** Prisma filter fragment matching unpaid CitationViolation rows. */
const UNPAID_ROW_OR = [{ settlementStatus: null }, { settlementStatus: 'pending' }];

/** Whole-peso sum of a row set's penaltyAtIssuance (payment code rounds). */
function sumPenalties(rows) {
  return Math.round(
    (rows || []).reduce((sum, row) => sum + toFiniteNumber(row?.penaltyAtIssuance), 0)
  );
}

/** Whole-peso total of a citation's fine. */
function fineTotal(citation) {
  return Math.round(toFiniteNumber(citation?.fineAmount));
}

/** Sum of penalties of the rows that have already been settled. */
function settledPenaltyTotal(citation) {
  const rows = citation?.violations || [];
  return sumPenalties(rows.filter((row) => row.settlementStatus === 'settled'));
}

/**
 * Derived (never stored) payment state for a citation. There is deliberately
 * no Citation.paidAmount column — everything comes from the violation rows.
 *
 *   - paidAmount: sum of settled row penalties. A legacy settled citation
 *     (no settled rows at all) treats its whole fine as paid; cancelled and
 *     warning records report 0.
 *   - remainingAmount: only pending citations can have a balance.
 *   - lastPaymentReference/Method: most recently settled row, falling back to
 *     the citation-level fields.
 */
function derivePaymentState(citation) {
  if (!citation) {
    return {
      paidAmount: 0,
      remainingAmount: 0,
      partiallyPaid: false,
      lastPaymentReference: null,
      lastPaymentMethod: null,
    };
  }

  const violations = citation.violations || [];
  const settledRows = violations.filter((row) => row.settlementStatus === 'settled');
  const status = citation.settlementStatus;

  let paidAmount = settledPenaltyTotal(citation);
  if (status === 'cancelled' || status === 'warning_only') {
    paidAmount = 0;
  } else if (status === 'settled' && settledRows.length === 0) {
    // Legacy citation settled before per-violation tracking existed.
    paidAmount = fineTotal(citation);
  }

  const remainingAmount = status === 'pending' ? Math.max(0, fineTotal(citation) - paidAmount) : 0;

  const ordered = [...settledRows].sort((a, b) => {
    const aAt = a.settledAt ? new Date(a.settledAt).getTime() : 0;
    const bAt = b.settledAt ? new Date(b.settledAt).getTime() : 0;
    if (aAt !== bAt) return bAt - aAt;
    return (b.id || 0) - (a.id || 0);
  });
  const lastWithValue = ordered.find((row) => row.paymentReference || row.paymentMethod) || null;

  return {
    paidAmount,
    remainingAmount,
    partiallyPaid: paidAmount > 0 && remainingAmount > 0,
    lastPaymentReference: lastWithValue?.paymentReference || citation.paymentReference || null,
    lastPaymentMethod: lastWithValue?.paymentMethod || citation.paymentMethod || null,
  };
}

/**
 * Display copy of a violation row. For a settled citation, legacy rows that
 * never got their own payment metadata inherit it from the citation; for a
 * cancelled citation they display as cancelled. Pending rows keep their NULL
 * status. The Prisma object is never mutated in place.
 */
function mapViolationForDisplay(violation, citation) {
  if (!violation) return violation;
  const mapped = { ...violation };
  if (citation?.settlementStatus === 'settled') {
    if (!mapped.settlementStatus) mapped.settlementStatus = 'settled';
    if (!mapped.settledAt) mapped.settledAt = citation.settledAt || null;
    if (!mapped.paymentMethod) mapped.paymentMethod = citation.paymentMethod || null;
    if (!mapped.paymentReference) mapped.paymentReference = citation.paymentReference || null;
  } else if (citation?.settlementStatus === 'cancelled') {
    if (!mapped.settlementStatus) mapped.settlementStatus = 'cancelled';
  }
  return mapped;
}

/** True when two id lists contain exactly the same ids. */
function sameIdSet(a, b) {
  const left = new Set(a || []);
  const right = new Set(b || []);
  if (left.size !== right.size) return false;
  for (const id of left) {
    if (!right.has(id)) return false;
  }
  return true;
}

/**
 * Ids of the unpaid rows currently allocated to `reference` (the citation's
 * persisted Xendit session). An empty result means the persisted session
 * predates per-violation allocation (legacy session).
 */
function allocatedRowIds(rows, reference) {
  if (!reference) return [];
  return (rows || [])
    .filter((row) => isUnpaidRow(row) && row.paymentReference === reference)
    .map((row) => row.id);
}

module.exports = {
  isSessionReference,
  activeCheckout,
  cancelSessionReference,
  lockCitation,
  expiryTime,
  isUnpaidRow,
  UNPAID_ROW_OR,
  sumPenalties,
  fineTotal,
  settledPenaltyTotal,
  derivePaymentState,
  mapViolationForDisplay,
  sameIdSet,
  allocatedRowIds,
  toFiniteNumber,
  PAYMENT_SESSION_TTL_MS,
  PAYMENT_LOCK_MS,
};
