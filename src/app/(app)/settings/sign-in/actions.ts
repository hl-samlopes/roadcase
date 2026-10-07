"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requireUser } from "@/lib/authz";
import { googleConfigured } from "@/lib/auth/google";
import { allowedDomainsSchema } from "@/lib/auth/google-policy";
import { db } from "@/lib/db";
import { formObject, invalid, type FormState } from "@/lib/forms/state";

const checkbox = z
  .literal("on")
  .optional()
  .transform((value) => value === "on");

const settingsSchema = z.object({
  googleAllowedDomains: allowedDomainsSchema,
  passwordSignIn: checkbox,
  adminPasswordSignIn: checkbox,
});

/** Saves Settings > Sign-in: allowed Google domains and who can still use a password. */
export async function saveSignInSettingsAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  if (!can(actor, "settings:manage", { organizationId: actor.organizationId })) {
    return { error: "You don't have permission to do that." };
  }
  const parsed = settingsSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const settings = parsed.data;

  if (!settings.passwordSignIn) {
    if (!googleConfigured() || settings.googleAllowedDomains.length === 0) {
      return {
        error:
          "Passwords can only be turned off while Google sign-in is on: list at least one allowed domain.",
      };
    }
    if (!settings.adminPasswordSignIn) {
      // Without a linked Google account, saving this would lock this admin out.
      const self = await db.user.findUnique({
        where: { id: actor.id },
        select: { googleSubject: true },
      });
      if (!self?.googleSubject) {
        return {
          error:
            "Sign in with Google once before turning off organization admins' passwords, so you can still get in.",
        };
      }
    }
  }

  await db.organization.update({ where: { id: actor.organizationId }, data: settings });
  revalidatePath("/settings/sign-in");
  return { success: "Sign-in settings saved." };
}
