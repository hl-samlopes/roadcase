/**
 * Sign-in throttling rules, kept pure so they can be tested without a
 * database. A key collects failures in a rolling window; reaching the limit
 * locks the key for a while.
 */

export interface ThrottleLimit {
  maxFailures: number;
  windowMs: number;
  lockMs: number;
}

const MINUTE = 60_000;

/** One username: 5 failures in 15 minutes locks it for 15 minutes. */
export const accountLimit: ThrottleLimit = {
  maxFailures: 5,
  windowMs: 15 * MINUTE,
  lockMs: 15 * MINUTE,
};

/** One IP address: generous, since a whole camp may share one connection. */
export const addressLimit: ThrottleLimit = {
  maxFailures: 50,
  windowMs: 15 * MINUTE,
  lockMs: 15 * MINUTE,
};

/**
 * Guest portal links tried from one IP address that don't work: 30 in 15
 * minutes locks that address out of the portal for 15 minutes, so tokens
 * can't be guessed in bulk. Working links never count.
 */
export const portalAddressLimit: ThrottleLimit = {
  maxFailures: 30,
  windowMs: 15 * MINUTE,
  lockMs: 15 * MINUTE,
};

/**
 * Changes made through one portal link: 30 saves in 15 minutes pauses that
 * link's changes for 15 minutes. Each save counts, successful or not.
 */
export const portalWriteLimit: ThrottleLimit = {
  maxFailures: 30,
  windowMs: 15 * MINUTE,
  lockMs: 15 * MINUTE,
};

export interface ThrottleState {
  failures: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
}

export function isLocked(state: ThrottleState | null, now: Date): boolean {
  return Boolean(state?.lockedUntil && state.lockedUntil > now);
}

/** The state after one more failed attempt. */
export function afterFailure(
  state: ThrottleState | null,
  now: Date,
  limit: ThrottleLimit,
): ThrottleState {
  const windowExpired = !state || now.getTime() - state.windowStartedAt.getTime() >= limit.windowMs;
  const failures = windowExpired ? 1 : state.failures + 1;
  const windowStartedAt = windowExpired ? now : state.windowStartedAt;
  const lockedUntil =
    failures >= limit.maxFailures
      ? new Date(now.getTime() + limit.lockMs)
      : isLocked(state, now)
        ? state!.lockedUntil
        : null;
  return { failures, windowStartedAt, lockedUntil };
}

export function accountKey(organizationSlug: string, username: string): string {
  return `user:${organizationSlug.toLowerCase()}:${username.trim().toLowerCase()}`;
}

export function addressKey(ip: string): string {
  return `ip:${ip}`;
}

export function portalLinkKey(linkId: string): string {
  return `portal-link:${linkId}`;
}

export function portalAddressKey(ip: string): string {
  return `portal-ip:${ip}`;
}

/** The client address from proxy headers, or null when unknown. */
export function clientAddress(headers: { get(name: string): string | null }): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || headers.get("x-real-ip")?.trim();
  return address && address.length <= 64 ? address : null;
}
