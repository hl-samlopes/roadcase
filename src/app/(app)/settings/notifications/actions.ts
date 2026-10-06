"use server";

import { revalidatePath } from "next/cache";
import { can, requireUser } from "@/lib/authz";
import { enqueue } from "@/lib/jobs/boss";
import { safeErrorMessage } from "@/lib/jobs/errors";
import type { FormState } from "@/lib/forms/state";

/** Queues a branded test email to the signed-in organization admin. */
export async function sendTestEmailAction(): Promise<FormState> {
  const actor = await requireUser();
  if (!can(actor, "settings:manage", { organizationId: actor.organizationId })) {
    return { error: "You don't have permission to do that." };
  }
  try {
    await enqueue("email.send", {
      organizationId: actor.organizationId,
      idempotencyKey: `test-email:${crypto.randomUUID()}`,
      to: { email: actor.email, name: actor.displayName },
      template: "test",
      data: { requestedBy: actor.displayName },
    });
  } catch (error) {
    console.error(`[notifications] Couldn't queue a test email: ${safeErrorMessage(error)}`);
    return { error: "Couldn't queue the test email. Try again in a minute." };
  }
  revalidatePath("/settings/notifications");
  return {
    success: `Test email queued to ${actor.email}. It should arrive within a minute; if it doesn't, check Recent job failures below.`,
  };
}
