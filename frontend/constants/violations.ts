/**
 * Enumerations mirrored from the Prisma schema (backend/prisma/schema.prisma).
 * If a value changes on the backend, change it here too — these power selects,
 * badges and filters in all three role workspaces.
 */

/* --- backend/prisma/schema.prisma: enum RecordType ------------------------ */
export const RECORD_TYPES = ["citation", "warning", "violation"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  citation: "Citation",
  warning: "Warning",
  violation: "Violation",
};

/**
 * NOTE / backend mismatch: the model defines 'violation' as a legal value, but
 * citationController.createCitation + listAllCitations only accept
 * 'citation' | 'warning'. Sending 'violation' is rejected with 422/ignored as a
 * filter. Kept here for model fidelity; create flows should use the first two.
 */
export function isRecordType(value: unknown): value is RecordType {
  return typeof value === "string" && (RECORD_TYPES as readonly string[]).includes(value);
}

/* --- backend/prisma/schema.prisma: enum SettlementStatus ------------------ */
export const SETTLEMENT_STATUSES = [
  "pending",
  "settled",
  "cancelled",
  "warning_only",
] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  pending: "Pending",
  settled: "Settled",
  cancelled: "Cancelled",
  warning_only: "Warning only",
};

export function isSettlementStatus(value: unknown): value is SettlementStatus {
  return (
    typeof value === "string" &&
    (SETTLEMENT_STATUSES as readonly string[]).includes(value)
  );
}

/* --- backend/prisma/schema.prisma: enum VerificationStatus ---------------- */
export const VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "flagged",
  "revoked",
  "suspended",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  pending: "Pending",
  verified: "Verified",
  flagged: "Flagged",
  revoked: "Revoked",
  suspended: "Suspended",
};

export function isVerificationStatus(value: unknown): value is VerificationStatus {
  return (
    typeof value === "string" &&
    (VERIFICATION_STATUSES as readonly string[]).includes(value)
  );
}

/** Statuses the backend blocks at login (authController.driverLogin → 403). */
export const BLOCKED_AT_LOGIN: readonly VerificationStatus[] = [
  "flagged",
  "revoked",
  "suspended",
];

/* --- backend/prisma/schema.prisma: enum PaymentMethod --------------------- */
export const PAYMENT_METHODS = ["cash", "gcash", "maya", "bank", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
