import "server-only";
import { db } from "@/lib/db";
import {
  accountLimit,
  addressLimit,
  afterFailure,
  isLocked,
  type ThrottleLimit,
  type ThrottleState,
} from "./throttle-policy";

export interface ThrottleKey {
  key: string;
  limit: ThrottleLimit;
}

export function throttleKeys(account: string, address: string | null): ThrottleKey[] {
  return [
    { key: account, limit: accountLimit },
    ...(address ? [{ key: address, limit: addressLimit }] : []),
  ];
}

/** Whether any of the keys is currently locked. */
export async function isThrottled(keys: ThrottleKey[]): Promise<boolean> {
  const now = new Date();
  const rows = await db.signInThrottle.findMany({ where: { key: { in: keys.map((k) => k.key) } } });
  return rows.some((row) => isLocked(row, now));
}

/** Counts one failed attempt against each key; rows are locked so concurrent failures all count. */
export async function recordFailure(keys: ThrottleKey[]): Promise<void> {
  const now = new Date();
  await db.$transaction(async (tx) => {
    for (const { key, limit } of keys) {
      await tx.$executeRaw`
        INSERT INTO "SignInThrottle" ("key", "failures", "windowStartedAt", "updatedAt")
        VALUES (${key}, 0, ${now}, ${now})
        ON CONFLICT ("key") DO NOTHING`;
      const [row] = await tx.$queryRaw<ThrottleState[]>`
        SELECT "failures", "windowStartedAt", "lockedUntil"
        FROM "SignInThrottle" WHERE "key" = ${key} FOR UPDATE`;
      const next = afterFailure(row.failures === 0 ? null : row, now, limit);
      await tx.signInThrottle.update({ where: { key }, data: next });
    }
  });
  // Old rows are no use once their window and lock have passed.
  await db.signInThrottle.deleteMany({
    where: { updatedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
  });
}

export async function clearThrottle(key: string): Promise<void> {
  await db.signInThrottle.deleteMany({ where: { key } });
}

/** Whole minutes left on a lock (at least 1), or null if the key isn't locked. */
export async function lockMinutesLeft(key: string): Promise<number | null> {
  const row = await db.signInThrottle.findUnique({ where: { key } });
  const now = new Date();
  if (!row?.lockedUntil || !isLocked(row, now)) return null;
  return Math.max(1, Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 60_000));
}
