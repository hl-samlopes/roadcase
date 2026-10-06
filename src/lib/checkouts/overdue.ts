/**
 * When a check-out is overdue, and when its staff representative is reminded.
 * Dates are calendar days in the organization's time zone (APP_TIME_ZONE,
 * US Eastern by default, where HNE is): a check-out due back on the 6th is
 * overdue from the start of the 7th there.
 */

export const DEFAULT_TIME_ZONE = "America/New_York";

export function appTimeZone(env: Record<string, string | undefined> = process.env): string {
  const zone = env.APP_TIME_ZONE?.trim();
  if (!zone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** The calendar date (YYYY-MM-DD) at this moment in the time zone. */
export function dateInZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** A stored calendar date (midnight UTC) as YYYY-MM-DD. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD); positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const OUTSTANDING = new Set(["OUT", "PARTIALLY_RETURNED"]);

/** Days overdue (1 on the day after the due date), or 0 when not overdue. */
export function daysOverdue(checkout: { status: string; dateDue: Date }, today: string): number {
  if (!OUTSTANDING.has(checkout.status)) return 0;
  return Math.max(0, daysBetween(isoDay(checkout.dateDue), today));
}

/** Remind on the first overdue day, then every 7 days (days 1, 8, 15, ...) until it's back. */
export function remindToday(days: number): boolean {
  return days >= 1 && (days - 1) % 7 === 0;
}
