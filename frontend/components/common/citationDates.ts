/**
 * Calendar-day bucketing for the enforcer's own citation counts.
 *
 * WHY these live here rather than in a page: the officer's home screen and the
 * Previous Citations list both need "how many did I issue today / this week /
 * this month", and the RN source had `isSameDay` / `isSameWeek` / `isSameMonth`
 * copy-pasted into two screens — a classic drift trap, since the two copies
 * were free to disagree. A `page.tsx` may only export the page and its route
 * config, so the shared home for these is a module beside `dates.ts`.
 *
 * These compare CALENDAR days in the viewer's local zone, unlike `dates.ts`,
 * which pins formatting to UTC. That difference is deliberate: a count of "what
 * did I issue today" is a question about the officer's own day, and shifting it
 * by a timezone would make the number disagree with the calendar they can see.
 */

/** Midnight local time on the day `value` falls in. */
function startOfDay(value: string | number | Date): number {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function isSameDay(a: string | number | Date, b: string | number | Date): boolean {
  return startOfDay(a) === startOfDay(b);
}

/**
 * Calendar week starting Sunday, matching `getDay()` (0 = Sunday).
 *
 * Day-of-week arithmetic, not a 7×24h window: "this week" in the RN UI meant
 * the officer's current week, and a rolling 168 hours would slide the boundary
 * across every weekday.
 */
export function isSameWeek(a: string | number | Date, b: string | number | Date): boolean {
  const date = a instanceof Date ? a : new Date(a);
  const reference = b instanceof Date ? b : new Date(b);

  const midnight = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  // getDay(): 0 = Sunday. Shift so the week starts on Sunday.
  const weekStart = new Date(midnight);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const elapsedDays = Math.round((target.getTime() - weekStart.getTime()) / 86_400_000);

  return elapsedDays >= 0 && elapsedDays < 7;
}

export function isSameMonth(a: string | number | Date, b: string | number | Date): boolean {
  const date = a instanceof Date ? a : new Date(a);
  const reference = b instanceof Date ? b : new Date(b);
  return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth();
}

/** The buckets the enforcer UI filters by, in display order. */
export const DATE_BUCKETS = ["all", "today", "week", "month"] as const;
export type DateBucket = (typeof DATE_BUCKETS)[number];

/** Human labels for the filter chips, matching the RN copy. */
export const DATE_BUCKET_LABELS: Record<DateBucket, string> = {
  all: "All",
  today: "Today",
  week: "This Week",
  month: "This Month",
};

export type CitationDateBucketFilter = (occurredAt: string | number | Date) => boolean;

/**
 * Turns a bucket into a predicate, so a screen filters with `buckets.every(...)`
 * over a list it already has. `now` is injected rather than read from the clock
 * so the caller can pass a hydration-safe timestamp (see `useClientNow`).
 */
export function predicateForBucket(bucket: DateBucket, now: number): CitationDateBucketFilter {
  switch (bucket) {
    case "today":
      return (occurredAt) => isSameDay(occurredAt, now);
    case "week":
      return (occurredAt) => isSameWeek(occurredAt, now);
    case "month":
      return (occurredAt) => isSameMonth(occurredAt, now);
    case "all":
      return () => true;
  }
}