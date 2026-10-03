"use server";

import { z } from "zod";
import { signIn } from "@/auth";
import { requireUser } from "@/lib/authz";
import { hashPassword, passwordSchema, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { formObject, invalid, type FormState } from "@/lib/forms/state";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(256),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Does not match the new password.",
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password different from your current one.",
  });

export async function changePasswordAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = schema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);

  const account = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  const { valid } = await verifyPassword(account.passwordHash, parsed.data.currentPassword);
  if (!valid) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: { currentPassword: ["That isn't your current password."] },
    };
  }

  // Bumping the session version signs out every other device.
  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.newPassword),
      passwordChangedAt: new Date(),
      sessionVersion: { increment: 1 },
    },
  });

  // Issue this device a fresh session with the new version.
  await signIn("credentials", {
    organization: user.organization.slug,
    username: user.username,
    password: parsed.data.newPassword,
    redirectTo: "/account/password?changed=1",
  });
  return {};
}
