import "server-only";
import { hash, needsRehash, verify } from "argon2";
import { z } from "zod";

/** Upper bound keeps hashing cost bounded for oversized input. */
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(256, "Use at most 256 characters.");

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies a password against a stored hash. With no hash (unknown or inactive
 * account) it still runs a verification so response timing does not reveal
 * whether the username exists.
 */
export async function verifyPassword(storedHash: string | null, password: string) {
  if (storedHash === null) {
    dummyHash ??= hash("roadcase-timing-equalizer");
    await verify(await dummyHash, password).catch(() => false);
    return { valid: false, rehash: false };
  }
  const valid = await verify(storedHash, password).catch(() => false);
  return { valid, rehash: valid && needsRehash(storedHash) };
}
