"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManageCheckout, requireUser, type CurrentUser } from "@/lib/authz";
import { clientIp, parseSignatureImage } from "@/lib/contracts/signing";
import {
  activeContract,
  prepareContract,
  recordSignature,
  voidUnsignedContract,
} from "@/lib/data/contract-records";
import { getCheckout } from "@/lib/data/checkouts";
import type { FormState } from "@/lib/forms/state";

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };
const PLEASE_FIX = "Please fix the highlighted fields.";

async function managedCheckout(actor: CurrentUser, checkoutId: string) {
  const checkout = await getCheckout(actor, checkoutId);
  return checkout && canManageCheckout(actor, checkout) ? checkout : null;
}

function refresh(checkoutId: string) {
  revalidatePath(`/checkouts/${checkoutId}`, "layout");
  revalidatePath("/checkouts");
}

/** Freezes the contract from the campus template; the check-out waits for signatures. */
export async function prepareContractAction(
  checkoutId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const checkout = await managedCheckout(actor, checkoutId);
  if (!checkout) return NOT_ALLOWED;
  const result = await prepareContract(checkout, actor.id);
  if (result.error) return { error: result.error };
  refresh(checkout.id);
  return { success: "Contract ready. Open the signing screen when the guest is with you." };
}

/** Before both have signed: void the contract and edit the draft again. */
export async function returnToDraftAction(
  checkoutId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const checkout = await managedCheckout(actor, checkoutId);
  if (!checkout || checkout.status !== "AWAITING_SIGNATURES") return NOT_ALLOWED;
  if (!(await voidUnsignedContract(checkout.organizationId, checkout.id))) {
    return { error: "This contract is already signed and can't go back to draft." };
  }
  refresh(checkout.id);
  return { success: "Back to draft. Signatures collected so far were set aside." };
}

const signSchema = z.object({
  role: z.enum(["GUEST", "STAFF"]),
  printedName: z.string().trim().min(1, "Type your full name.").max(200),
  consent: z.literal("on", "Tick the box to agree before signing."),
  textHash: z.string().regex(/^[0-9a-f]{64}$/),
  signature: z.string().max(700_000),
});

export async function signContractAction(
  checkoutId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const checkout = await managedCheckout(actor, checkoutId);
  if (!checkout || checkout.status !== "AWAITING_SIGNATURES") return NOT_ALLOWED;

  const parsed = signSchema.safeParse({
    consent: undefined,
    signature: "",
    ...Object.fromEntries(
      [...formData.entries()].filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
  });
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
    return { error: PLEASE_FIX, fieldErrors };
  }
  const input = parsed.data;
  // The staff representative signs for themselves, on their own account.
  if (input.role === "STAFF" && checkout.staffRepId !== actor.id) {
    return {
      error: `Only ${checkout.staffRep?.displayName ?? "the staff representative"} can sign as staff representative, signed in as themselves.`,
    };
  }
  const image = parseSignatureImage(input.signature);
  if (!image.ok) return { error: PLEASE_FIX, fieldErrors: { signature: [image.error] } };

  const contract = await activeContract(checkout.organizationId, checkout.id);
  if (!contract) return { error: "This check-out has no contract to sign." };

  const requestHeaders = await headers();
  const result = await recordSignature(checkout.organizationId, contract.id, {
    role: input.role,
    printedName: input.printedName,
    textHash: input.textHash,
    image: image.bytes,
    ipAddress: clientIp(requestHeaders),
    userAgent: requestHeaders.get("user-agent")?.slice(0, 500) ?? null,
    collectedById: actor.id,
  });
  if (result.error) return { error: result.error };
  refresh(checkout.id);
  return {
    success: result.complete
      ? "Both parties have signed. The check-out is now out, and the signed PDF will be emailed to both of you."
      : `Signed by ${input.printedName}.`,
  };
}
