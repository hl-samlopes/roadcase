"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManageCheckout, requireUser } from "@/lib/authz";
import { checkInLines, type CheckInEntry } from "@/lib/data/check-in";
import { getCheckout } from "@/lib/data/checkouts";
import type { FormState } from "@/lib/forms/state";

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };

/**
 * Checks in the ticked lines with their condition and notes. Fields per line:
 * `return` (the line id, when ticked), `condition-<line id>`, `notes-<line id>`.
 */
export async function checkInAction(
  checkoutId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const checkout = await getCheckout(actor, checkoutId);
  if (!checkout || !canManageCheckout(actor, checkout)) return NOT_ALLOWED;
  if (checkout.status !== "OUT" && checkout.status !== "PARTIALLY_RETURNED") {
    return { error: "Only a check-out that's out can have items checked in." };
  }

  const ticked = new Set(formData.getAll("return").map(String));
  const fieldErrors: Record<string, string[]> = {};
  const entries: CheckInEntry[] = [];
  for (const line of checkout.lines) {
    if (!ticked.has(line.id) || line.returnedAt) continue;
    const conditionId = String(formData.get(`condition-${line.id}`) ?? "");
    const notes = z
      .string()
      .trim()
      .max(2000)
      .safeParse(formData.get(`notes-${line.id}`) ?? "");
    const label = `${line.item.code} ${line.item.name}`;
    if (!z.uuid().safeParse(conditionId).success) fieldErrors[label] = ["Choose its condition."];
    else if (!notes.success) fieldErrors[label] = ["Keep notes under 2000 characters."];
    else entries.push({ lineId: line.id, conditionId, notes: notes.data || null });
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the highlighted items.", fieldErrors };
  }

  const result = await checkInLines(actor.id, checkout, entries);
  if (result.error) return { error: result.error };
  revalidatePath(`/checkouts/${checkout.id}`);
  revalidatePath("/checkouts");
  revalidatePath("/tickets");

  const parts = [`Checked in ${result.returned} item${result.returned === 1 ? "" : "s"}.`];
  for (const ticket of result.tickets) {
    parts.push(
      ticket.opened
        ? `Opened ticket #${ticket.number} for ${ticket.code}.`
        : `Added the return to ${ticket.code}'s open ticket #${ticket.number}.`,
    );
  }
  parts.push(result.status === "RETURNED" ? "Everything is back." : "Some items are still out.");
  return { success: parts.join(" ") };
}
