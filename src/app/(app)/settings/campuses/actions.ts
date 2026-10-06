"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { manageableCampuses } from "@/lib/admin/places";
import { staffOptions } from "@/lib/data/checkouts";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/forms/state";

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };

/**
 * Sets (or clears) a campus's default contact: someone who runs check-outs
 * there. Campus admins (and organization admins) set it.
 */
export async function setCampusContactAction(
  campusId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const campus = (await manageableCampuses(actor)).find((c) => c.id === campusId);
  if (!campus) return NOT_ALLOWED;
  const choice = String(formData.get("defaultContactId") ?? "");
  let contact: { id: string; displayName: string } | null = null;
  if (choice) {
    if (!z.uuid().safeParse(choice).success) return NOT_ALLOWED;
    contact =
      (await staffOptions(actor.organizationId, campus.id)).find((p) => p.id === choice) ?? null;
    if (!contact) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: { defaultContactId: ["Choose someone who runs check-outs at this campus."] },
      };
    }
  }
  await db.campus.update({
    where: { id: campus.id },
    data: { defaultContactId: contact?.id ?? null },
  });
  revalidatePath("/settings/campuses");
  return {
    success: contact
      ? `${contact.displayName} is ${campus.code}'s default contact.`
      : `${campus.code} has no default contact; request and band emails go to everyone who runs check-outs there.`,
  };
}
