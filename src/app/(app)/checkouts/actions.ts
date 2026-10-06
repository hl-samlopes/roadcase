"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageCheckout, requireUser, type CurrentUser } from "@/lib/authz";
import { parseCodes } from "@/lib/checkouts/availability";
import {
  addItemsToCheckout,
  checkoutCampuses,
  getCheckout,
  staffOptions,
  type AddResult,
} from "@/lib/data/checkouts";
import { db } from "@/lib/db";
import { formObject, invalid, type FormState } from "@/lib/forms/state";

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };
const PLEASE_FIX = "Please fix the highlighted fields.";
const NOT_DRAFT: FormState = { error: "Only a draft check-out can be changed." };

const detailsSchema = z
  .object({
    groupName: z.string().trim().min(1, "Enter the guest group's name.").max(200),
    guestRepName: z.string().trim().min(1, "Enter the guest representative's name.").max(200),
    guestRepEmail: z
      .email("Enter an email address such as name@example.com.")
      .max(254)
      .transform((value) => value.toLowerCase()),
    guestRepPhone: z
      .string()
      .trim()
      .regex(/^[0-9+().\-\s]{7,30}$/, "Enter a phone number, such as (555) 123-4567."),
    staffRepId: z.uuid("Choose the staff representative."),
    dateOut: z.iso.date("Enter the date the equipment goes out."),
    dateDue: z.iso.date("Enter the date the equipment comes back."),
    notes: z
      .string()
      .trim()
      .max(5000)
      .transform((value) => value || null),
  })
  .refine((value) => value.dateDue >= value.dateOut, {
    path: ["dateDue"],
    message: "The return date can't be before the date out.",
  });

const day = (value: string) => new Date(`${value}T00:00:00Z`);

async function checkDetails(campusId: string, organizationId: string, formData: FormData) {
  const parsed = detailsSchema.safeParse({ notes: "", ...formObject(formData) });
  if (!parsed.success) return { ok: false as const, state: invalid(parsed.error) };
  const staff = await staffOptions(organizationId, campusId);
  if (!staff.some((person) => person.id === parsed.data.staffRepId)) {
    return {
      ok: false as const,
      state: {
        error: PLEASE_FIX,
        fieldErrors: { staffRepId: ["Choose someone who runs check-outs at this campus."] },
      } satisfies FormState,
    };
  }
  const { dateOut, dateDue, ...rest } = parsed.data;
  return { ok: true as const, data: { ...rest, dateOut: day(dateOut), dateDue: day(dateDue) } };
}

export async function createCheckoutAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const campusId = String(formData.get("campusId") ?? "");
  const campus = (await checkoutCampuses(actor, "checkout:manage")).find((c) => c.id === campusId);
  if (!campus) {
    return { error: PLEASE_FIX, fieldErrors: { campusId: ["Choose a campus."] } };
  }
  const details = await checkDetails(campus.id, actor.organizationId, formData);
  if (!details.ok) return details.state;

  const checkout = await db.$transaction(async (tx) => {
    const organization = await tx.organization.update({
      where: { id: actor.organizationId },
      data: { checkoutSequence: { increment: 1 } },
      select: { checkoutSequence: true },
    });
    return tx.checkout.create({
      data: {
        organizationId: actor.organizationId,
        campusId: campus.id,
        number: organization.checkoutSequence,
        createdById: actor.id,
        ...details.data,
      },
      select: { id: true },
    });
  });
  revalidatePath("/checkouts");
  redirect(`/checkouts/${checkout.id}?created=1`);
}

/** A draft check-out the actor manages, or a form error. */
async function editableDraft(actor: CurrentUser, id: string) {
  const checkout = await getCheckout(actor, id);
  if (!checkout || !canManageCheckout(actor, checkout)) return { error: NOT_ALLOWED };
  if (checkout.status !== "DRAFT") return { error: NOT_DRAFT };
  return { checkout };
}

function refresh(id: string) {
  revalidatePath(`/checkouts/${id}`);
  revalidatePath("/checkouts");
}

export async function updateCheckoutAction(
  checkoutId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const { checkout, error } = await editableDraft(actor, checkoutId);
  if (!checkout) return error;
  const details = await checkDetails(checkout.campusId, actor.organizationId, formData);
  if (!details.ok) return details.state;
  await db.checkout.update({ where: { id: checkout.id }, data: details.data });
  refresh(checkout.id);
  return { success: "Details saved." };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Turns an add result into the form message: what went on, and each refusal by code. */
function addResultState(result: AddResult): FormState {
  const state: FormState = {};
  if (result.added.length > 0) {
    state.success =
      result.added.length === 1
        ? `Added ${result.added[0].code} ${result.added[0].name}.`
        : `Added ${plural(result.added.length, "item")}.`;
  }
  if (result.refused.length > 0) {
    state.error =
      result.refused.length === 1 ? "This item wasn't added:" : "These items weren't added:";
    state.fieldErrors = Object.fromEntries(
      result.refused.map((refused) => [
        refused.name ? `${refused.code} ${refused.name}` : refused.code,
        [refused.message],
      ]),
    );
  }
  return state;
}

/** Adds items by scanned or typed codes (one or many). */
export async function addItemsAction(
  checkoutId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const { checkout, error } = await editableDraft(actor, checkoutId);
  if (!checkout) return error;
  const codes = parseCodes(String(formData.get("codes") ?? ""));
  if (codes.length === 0) {
    return { error: PLEASE_FIX, fieldErrors: { codes: ["Scan or type at least one item code."] } };
  }
  const result = await addItemsToCheckout(actor, checkout, codes);
  if (result.added.length > 0) refresh(checkout.id);
  return addResultState(result);
}

/** Adds one item picked from search results. */
export async function addItemByIdAction(
  checkoutId: string,
  itemId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const { checkout, error } = await editableDraft(actor, checkoutId);
  if (!checkout) return error;
  if (!z.uuid().safeParse(itemId).success) return NOT_ALLOWED;
  const item = await db.item.findFirst({
    where: { id: itemId, organizationId: actor.organizationId },
    select: { code: true },
  });
  if (!item) return NOT_ALLOWED;
  const result = await addItemsToCheckout(actor, checkout, [item.code]);
  if (result.added.length > 0) refresh(checkout.id);
  return addResultState(result);
}

export async function removeLineAction(
  checkoutId: string,
  lineId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const { checkout, error } = await editableDraft(actor, checkoutId);
  if (!checkout) return error;
  const line = checkout.lines.find((l) => l.id === lineId);
  if (!line) return NOT_ALLOWED;
  await db.checkoutLine.delete({ where: { id: line.id } });
  refresh(checkout.id);
  return { success: `Removed ${line.item.code} ${line.item.name}.` };
}

const feeSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[$,]/g, ""))
  .refine(
    (value) => value === "" || /^\d{1,10}(\.\d{1,2})?$/.test(value),
    "Enter an amount such as 25.00, or leave it empty for no fee.",
  )
  .transform((value) => value || null);

/** Saves every line's fee at once; an empty fee means none. */
export async function saveFeesAction(
  checkoutId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const { checkout, error } = await editableDraft(actor, checkoutId);
  if (!checkout) return error;

  const fieldErrors: Record<string, string[]> = {};
  const updates: { id: string; fee: string | null }[] = [];
  for (const line of checkout.lines) {
    const parsed = feeSchema.safeParse(formData.get(`fee-${line.id}`) ?? "");
    if (parsed.success) updates.push({ id: line.id, fee: parsed.data });
    else fieldErrors[`${line.item.code} ${line.item.name}`] = [parsed.error.issues[0].message];
  }
  if (Object.keys(fieldErrors).length > 0) return { error: PLEASE_FIX, fieldErrors };

  await db.$transaction(
    updates.map((update) =>
      db.checkoutLine.update({ where: { id: update.id }, data: { fee: update.fee } }),
    ),
  );
  refresh(checkout.id);
  return { success: "Fees saved." };
}

/**
 * Cancels a check-out that isn't out yet (a draft, or one awaiting signatures,
 * whose unsigned contract is voided) and releases its items.
 */
export async function cancelCheckoutAction(
  checkoutId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const checkout = await getCheckout(actor, checkoutId);
  if (!checkout || !canManageCheckout(actor, checkout)) return NOT_ALLOWED;
  if (checkout.status !== "DRAFT" && checkout.status !== "AWAITING_SIGNATURES") {
    return { error: "A check-out that's out can't be cancelled; check its items in instead." };
  }
  await db.$transaction([
    db.contract.updateMany({
      where: { checkoutId: checkout.id, voidedAt: null, signedAt: null },
      data: { voidedAt: new Date() },
    }),
    db.checkout.update({
      where: { id: checkout.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    }),
    db.checkoutLine.updateMany({ where: { checkoutId: checkout.id }, data: { holdsItem: false } }),
  ]);
  refresh(checkout.id);
  return { success: "Check-out cancelled. Its items are free for other check-outs." };
}
