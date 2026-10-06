"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { portalCan, resolvePortal } from "@/lib/authz";
import { isThrottled, recordFailure } from "@/lib/auth/throttle";
import { portalLinkKey, portalWriteLimit } from "@/lib/auth/throttle-policy";
import { portalCatalog, portalRequest } from "@/lib/data/portal";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/forms/state";
import { enqueue } from "@/lib/jobs/boss";
import { parseQuantity } from "@/lib/portal/catalog";
import { quantityField } from "@/lib/portal/fields";
import { guestCanEdit } from "@/lib/portal/requests";
import { encryptSecret, secretsConfigured } from "@/lib/secrets";

const LINK_GONE: FormState = {
  error: "This link no longer works. Ask your staff contact for a new one.",
};
const LOCKED: FormState = {
  error:
    "Staff have started reviewing your request, so it can't be changed here. Contact your staff contact.",
};
const TOO_MANY: FormState = {
  error: "That's a lot of changes in a short time. Wait a few minutes, then try again.",
};
const noteSchema = z.string().trim().max(2000, "Keep the note under 2,000 characters.");

/** The portal for this token, allowed to edit its request and not paused, or a form error. */
async function editingPortal(token: string) {
  const portal = await resolvePortal(token);
  if (!portal || !portalCan(portal.principal, "request:edit", portal.principal)) {
    return { error: LINK_GONE };
  }
  const keys = [{ key: portalLinkKey(portal.principal.linkId), limit: portalWriteLimit }];
  if (await isThrottled(keys)) return { error: TOO_MANY };
  // Every save counts toward the limit, whatever its outcome.
  await recordFailure(keys);
  return { portal };
}

function refresh() {
  revalidatePath("/portal/[token]", "page");
  revalidatePath("/portal/[token]/equipment", "page");
}

/**
 * Saves the group's request, and sends it when the "send" button was used.
 * Quantities are checked against what's free for the group's dates now,
 * not what the page showed when it loaded.
 */
export async function saveRequestAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const { portal, error } = await editingPortal(token);
  if (!portal) return error;
  const { principal, group } = portal;
  const existing = await portalRequest(principal);
  if (existing && !guestCanEdit(existing.status)) return LOCKED;
  // A request that was already sent can only be sent again with its changes.
  const send = formData.get("intent") === "send" || existing?.status === "SUBMITTED";

  const catalog = await portalCatalog(principal, group);
  const fieldErrors: Record<string, string[]> = {};
  const lines: { categoryId: string; kindKey: string; name: string; quantityRequested: number }[] =
    [];
  for (const { kinds } of catalog) {
    for (const kind of kinds) {
      const quantity = parseQuantity(formData.get(quantityField(kind)));
      if (quantity === null) {
        fieldErrors[kind.name] = ["Enter a whole number, or leave it blank."];
      } else if (quantity > kind.available) {
        fieldErrors[kind.name] = [
          kind.available === 0
            ? "None are free for your dates."
            : `Only ${kind.available} ${kind.available === 1 ? "is" : "are"} free for your dates.`,
        ];
      } else if (quantity > 0) {
        lines.push({
          categoryId: kind.categoryId,
          kindKey: kind.key,
          name: kind.name,
          quantityRequested: quantity,
        });
      }
    }
  }
  const note = noteSchema.safeParse(formData.get("note") ?? "");
  if (!note.success) fieldErrors.note = note.error.issues.map((issue) => issue.message);
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix these and try again.", fieldErrors };
  }
  if (send && lines.length === 0) {
    return { error: "Choose at least one item before sending your request." };
  }

  const contact = await db.guestGroup.findUniqueOrThrow({
    where: { id: principal.guestGroupId },
    select: { repEmail: true, repName: true },
  });
  const now = new Date();
  await db.$transaction(async (tx) => {
    const request = await tx.equipmentRequest.upsert({
      where: { guestGroupId: principal.guestGroupId },
      create: {
        organizationId: principal.organizationId,
        campusId: principal.campusId,
        guestGroupId: principal.guestGroupId,
        status: send ? "SUBMITTED" : "DRAFT",
        note: note.data || null,
        submittedAt: send ? now : null,
      },
      update: {
        status: send ? "SUBMITTED" : "DRAFT",
        note: note.data || null,
        ...(send ? { submittedAt: now } : {}),
      },
      select: { id: true },
    });
    await tx.equipmentRequestLine.deleteMany({ where: { requestId: request.id } });
    if (lines.length > 0) {
      await tx.equipmentRequestLine.createMany({
        data: lines.map((line) => ({ ...line, requestId: request.id })),
      });
    }
    if (send) {
      await enqueue(
        "email.send",
        {
          organizationId: principal.organizationId,
          idempotencyKey: `portal-request:${request.id}:${now.getTime()}`,
          recipient: { email: contact.repEmail, name: contact.repName },
          template: "portal-request",
          data: {
            requestId: request.id,
            submittedAt: now.toISOString(),
            // The page link, sealed like a portal link email; left out without the key.
            ...(secretsConfigured()
              ? { linkId: principal.linkId, sealedToken: encryptSecret(token) }
              : {}),
          },
        },
        { tx },
      );
    }
  });
  refresh();
  const count = lines.reduce((sum, line) => sum + line.quantityRequested, 0);
  const items = `${count} item${count === 1 ? "" : "s"}`;
  return {
    success: send
      ? existing?.status === "SUBMITTED"
        ? `Sent your changes (${items}). We emailed you a copy.`
        : `Sent your request for ${items}. We emailed you a copy.`
      : `Saved ${items} for later. Staff won't see it until you send it.`,
  };
}

/** Takes a sent request back before staff start on it; it can be changed and sent again. */
export async function withdrawRequestAction(
  token: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const { portal, error } = await editingPortal(token);
  if (!portal) return error;
  const { count } = await db.equipmentRequest.updateMany({
    where: { guestGroupId: portal.principal.guestGroupId, status: "SUBMITTED" },
    data: { status: "WITHDRAWN" },
  });
  if (count === 0) return LOCKED;
  refresh();
  return { success: "Withdrew your request. You can change it and send it again." };
}
