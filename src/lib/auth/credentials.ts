import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "./password";
import { clearThrottle, isThrottled, recordFailure, throttleKeys } from "./throttle";
import { accountKey, addressKey } from "./throttle-policy";

export const credentialsSchema = z.object({
  organization: z.string().min(1).max(100),
  username: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(256),
});

export type CredentialsResult =
  | {
      status: "ok";
      user: { id: string; organizationId: string; name: string; sessionVersion: number };
    }
  | { status: "invalid" }
  | { status: "locked" };

/**
 * Checks a username and password, without saying which part was wrong.
 * Repeated failures lock the username, and the client address, for a while;
 * unknown usernames lock the same way, so locks don't reveal which exist.
 */
export async function verifyCredentials(
  input: unknown,
  ip: string | null,
): Promise<CredentialsResult> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { organization, username, password } = parsed.data;

  const account = accountKey(organization, username);
  const keys = throttleKeys(account, ip ? addressKey(ip) : null);
  // Checked before the password, so locked attempts cost no hashing either.
  if (await isThrottled(keys)) return { status: "locked" };

  const user = await db.user.findFirst({
    where: { username, organization: { slug: organization } },
    select: {
      id: true,
      organizationId: true,
      displayName: true,
      passwordHash: true,
      isActive: true,
      sessionVersion: true,
    },
  });

  const { valid, rehash } = await verifyPassword(
    user?.isActive ? user.passwordHash : null,
    password,
  );
  if (!user || !valid) {
    await recordFailure(keys);
    return { status: "invalid" };
  }
  await clearThrottle(account);

  await db.user.update({
    where: { id: user.id },
    data: {
      lastSignInAt: new Date(),
      ...(rehash ? { passwordHash: await hashPassword(password) } : {}),
    },
  });

  return {
    status: "ok",
    user: {
      id: user.id,
      organizationId: user.organizationId,
      name: user.displayName,
      sessionVersion: user.sessionVersion,
    },
  };
}
