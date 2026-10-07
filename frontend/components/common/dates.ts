/**
 * Date helpers shared by the record cards.
 *
 * Everything here formats in UTC on purpose. The RN screens call
 * toLocaleDateString with no timeZone option, which on a phone means the
 * device's zone — but on the web the server has no idea which zone the visitor
 * is in, so a locally-formatted date renders one way in the HTML and another
 * after hydration. Pinning to UTC keeps the server and client output identical.
 */

const DATE_SHORT = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" } as const;
const DATE_LONG = { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" } as const;
const TIME_SHORT = { hour: "numeric", minute: "2-digit", timeZone: "UTC" } as const;

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * A DATE-ONLY value ('YYYY-MM-DD') as LOCAL midnight.
 *
 * `new Date("2026-10-10")` is specified to parse as UTC midnight, which in any
 * timezone behind UTC renders as the previous day and in one ahead of UTC lands
 * partway into the correct day. Since the backend sends calendar dates with no
 * zone attached, the components are assembled from the parts so the day the
 * string names is the day we compare against.
 *
 * A full ISO datetime is left alone — it carries a real instant, and shifting
 * it would be wrong.
 */
function toCalendarDate(value: string | number | Date): Date {
  if (typeof value !== "string") return toDate(value);

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return toDate(value);

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

/** "Mar 4, 2025" — matches the RN date line on the violation cards. */
export function formatShortDate(value: string | number | Date): string {
  return toDate(value).toLocaleDateString("en-US", DATE_SHORT);
}

/** "March 4, 2025" — the long form used on headings and detail rows. */
export function formatLongDate(value: string | number | Date): string {
  return toDate(value).toLocaleDateString("en-US", DATE_LONG);
}

/** "9:30 AM" — appended to the long date on the citation receipt. */
export function formatTime(value: string | number | Date): string {
  return toDate(value).toLocaleTimeString("en-US", TIME_SHORT);
}

/** "March 4, 2025 at 9:30 AM" */
export function formatDateTime(value: string | number | Date): string {
  const date = toDate(value);
  return `${formatLongDate(date)} at ${formatTime(date)}`;
}

export type DueUrgency = "normal" | "soon" | "overdue";

export type DueInfo = {
  /** Whole days until the due date. Negative once it has passed. */
  daysLeft: number;
  /** "Overdue — was due Mar 4, 2025" and friends. */
  label: string;
  urgency: DueUrgency;
};

/**
 * Mirrors the DueDateLine helper in MyViolationsScreen / ViolationDetailScreen:
 * anything inside three days is amber, anything past the date is red.
 *
 * WHY the day count is computed in LOCAL time while the formatters above are
 * pinned to UTC: the backend sends `dueDate` as a bare calendar date
 * ('YYYY-MM-DD', re-serialised by citationController.serializeCitation). The
 * browser parses that string as UTC midnight, but the due date means midnight
 * in the DRIVER's day — in the Philippines (UTC+8) that made "Overdue" appear
 * at 08:00 on the day after the due date instead of at 00:00, and "Due today"
 * disappear for the first eight hours of the due day. Comparing calendar days
 * directly is what "due today" actually means.
 */
export function dueInfo(dueDate: string | number | Date, now: number): DueInfo {
  const date = toCalendarDate(dueDate);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  // Round, not ceil: both values are local midnights, so the difference is an
  // exact number of days (DST transitions make a /86400000 quotient fractional).
  const daysLeft = Math.round((date.getTime() - startOfToday.getTime()) / 86_400_000);
  const formatted = formatShortDate(date);

  if (daysLeft < 0) {
    return { daysLeft, label: `Overdue — was due ${formatted}`, urgency: "overdue" };
  }
  if (daysLeft === 0) {
    return { daysLeft, label: `Due today (${formatted})`, urgency: "soon" };
  }
  const plural = daysLeft === 1 ? "day" : "days";
  return {
    daysLeft,
    label: `Due ${formatted} (${daysLeft} ${plural} left)`,
    urgency: daysLeft <= 3 ? "soon" : "normal",
  };
}

/** Peso amount with thousands separators, as used across both apps. */
export function formatPeso(amount: string | number): string {
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) return "₱0";
  return `₱${value.toLocaleString("en-US")}`;
}