import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "./password";

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

/**
 * Checks a username and password. Returns the user on success and null on any
 * failure, without saying which part was wrong.
 */
export async function verifyCredentials(input: unknown) {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return null;
  const { organization, username, password } = parsed.data;

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
  if (!user || !valid) return null;

  await db.user.update({
    where: { id: user.id },
    data: {
      lastSignInAt: new Date(),
      ...(rehash ? { passwordHash: await hashPassword(password) } : {}),
    },
  });

  return {
    id: user.id,
    organizationId: user.organizationId,
    name: user.displayName,
    sessionVersion: user.sessionVersion,
  };
}
