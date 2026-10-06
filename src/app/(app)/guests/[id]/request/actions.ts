"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageCheckout, requireUser, type CurrentUser } from "@/lib/authz";
import { defaultStaffId, itemsForNewCheckout, staffOptions } from "@/lib/data/checkouts";
import { getRequestForReview } from "@/lib/data/requests";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/forms/prisma-errors";
import type { FormState } from "@/lib/forms/state";
import { enqueue } from "@/lib/jobs/boss";
import { kindKey, parseQuantity } from "@/lib/portal/catalog";
import { decisionStatus, waitingStatuses } from "@/lib/portal/requests";

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };
const CHANGED: FormState = {
  error: "The group changed its request while you were reviewing it. Reload to see the changes.",
};
const noteSchema = z.string().trim().max(500, "Keep notes under 500 characters.");
const messageSchema = z.string().trim().max(2000, "Keep the message under 2,000 characters.");

/** The group's sent request, if the actor reviews requests at its campus. */
async function reviewable(actor: CurrentUser, groupId: string) {
  const review = await getRequestForReview(actor, groupId);
  if (!review?.request || !canManageCheckout(actor, review.group)) return null;
  if (review.group.archivedAt) return null;
  return { group: review.group, request: review.request };
}

function refresh(groupId: string) {
  revalidatePath(`/guests/${groupId}`, "layout");
  revalidatePath("/guests/requests");
}

/**
 * Saves staff's decisions on each line. "Save" keeps it in review (and stops
 * the group changing it); "send" decides the request and emails the group.
 */
export async function saveReviewAction(
  groupId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const found = await reviewable(actor, groupId);
  if (!found) return NOT_ALLOWED;
  const { group, request } = found;
  if (!waitingStatuses.includes(request.status)) {
    return { error: "This request already has a decision. Reopen it to change it." };
  }
  if (String(formData.get("submittedAt") ?? "") !== request.submittedAt?.toISOString()) {
    return CHANGED;
  }
  const send = formData.get("intent") === "send";

  const fieldErrors: Record<string, string[]> = {};
  const decisions = request.lines.map((line) => {
    const raw = formData.get(`approved-${line.id}`);
    const blank = typeof raw !== "string" || raw.trim() === "";
    const approved = blank ? null : parseQuantity(raw);
    const note = noteSchema.safeParse(formData.get(`note-${line.id}`) ?? "");
    if (!blank && approved === null) {
      fieldErrors[line.name] = ["Enter a whole number to approve, or 0."];
    } else if (send && blank) {
      fieldErrors[line.name] = ["Enter how many to approve (0 declines it)."];
    } else if (approved !== null && approved > 0 && approved > line.free) {
      fieldErrors[line.name] = [
        line.free === 0
          ? "None are free for the group's dates."
          : `Only ${line.free} ${line.free === 1 ? "is" : "are"} free for the group's dates.`,
      ];
    }
    if (!note.success) fieldErrors[`${line.name} note`] = [note.error.issues[0].message];
    return { line, approved, note: note.success ? note.data || null : null };
  });
  const message = messageSchema.safeParse(formData.get("staffMessage") ?? "");
  if (!message.success) fieldErrors["Message to the group"] = [message.error.issues[0].message];
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix these and try again.", fieldErrors };
  }

  const status = send
    ? decisionStatus(
        decisions.map((d) => ({
          quantityRequested: d.line.quantityRequested,
          quantityApproved: d.approved ?? 0,
        })),
      )
    : "IN_REVIEW";
  const now = new Date();
  const saved = await db.$transaction(async (tx) => {
    // Only if the group hasn't sent a newer version in the meantime.
    const { count } = await tx.equipmentRequest.updateMany({
      where: {
        id: request.id,
        status: { in: waitingStatuses },
        submittedAt: request.submittedAt,
      },
      data: {
        status,
        staffMessage: message.data || null,
        ...(send ? { decidedAt: now, decidedById: actor.id } : {}),
      },
    });
    if (count === 0) return false;
    for (const { line, approved, note } of decisions) {
      await tx.equipmentRequestLine.update({
        where: { id: line.id },
        data: { quantityApproved: approved, staffNote: note },
      });
    }
    if (send) {
      await enqueue(
        "email.send",
        {
          organizationId: group.organizationId,
          idempotencyKey: `portal-decision:${request.id}:${now.getTime()}`,
          recipient: { email: group.repEmail, name: group.repName },
          template: "portal-decision",
          data: { requestId: request.id, decidedAt: now.toISOString() },
        },
        { tx },
      );
    }
    return true;
  });
  if (!saved) return CHANGED;
  refresh(group.id);
  if (!send) return { success: "Saved. The group can no longer change its request." };
  // The review form gives way to the decision, so the page says it was sent.
  redirect(`/guests/${group.id}/request?sent=1`);
}

/** Takes a decided request back into review, until it becomes a check-out. */
export async function reopenReviewAction(
  groupId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const found = await reviewable(actor, groupId);
  if (!found) return NOT_ALLOWED;
  const { request } = found;
  const { count } = await db.equipmentRequest.updateMany({
    where: {
      id: request.id,
      status: { in: ["APPROVED", "PARTLY_APPROVED", "DECLINED"] },
      OR: [{ checkoutId: null }, { checkout: { status: "CANCELLED" } }],
    },
    data: { status: "IN_REVIEW", decidedAt: null, decidedById: null, checkoutId: null },
  });
  if (count === 0) {
    return { error: "Only a decided request that isn't a check-out yet can be reopened." };
  }
  refresh(groupId);
  return { success: "Reopened. Send a new decision when you're done; the group will be emailed." };
}

/**
 * Makes a draft check-out for the group from its approved request, with the
 * items staff chose for each approved line. Every item must be free for a
 * check-out now (Phase 2's rules), and each line takes at most what was
 * approved; more can be added to the draft afterwards as usual.
 */
export async function createCheckoutFromRequestAction(
  groupId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const found = await reviewable(actor, groupId);
  if (!found) return NOT_ALLOWED;
  const { group, request } = found;
  if (request.status !== "APPROVED" && request.status !== "PARTLY_APPROVED") {
    return { error: "Only an approved request can become a check-out." };
  }
  if (request.checkout && request.checkout.status !== "CANCELLED") {
    return { error: `This request is already check-out #${request.checkout.number}.` };
  }

  const lines = request.lines.filter((line) => (line.quantityApproved ?? 0) > 0);
  const items = await itemsForNewCheckout(
    actor,
    group,
    lines.map((line) => line.categoryId),
  );
  const chosen = [...new Set(formData.getAll("item").map(String))];
  const fieldErrors: Record<string, string[]> = {};
  const counts = new Map<string, number>();
  for (const id of chosen) {
    const item = items.find((candidate) => candidate.id === id);
    const line = item
      ? lines.find((l) => l.categoryId === item.categoryId && l.kindKey === kindKey(item.name))
      : undefined;
    if (!item || !line) return { error: "Choose items from the lists on this page." };
    if (item.refusal) fieldErrors[`${item.code} ${item.name}`] = [item.refusal];
    counts.set(line.id, (counts.get(line.id) ?? 0) + 1);
  }
  for (const line of lines) {
    const count = counts.get(line.id) ?? 0;
    if (count > (line.quantityApproved ?? 0)) {
      fieldErrors[line.name] = [`Choose at most ${line.quantityApproved} (what was approved).`];
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "These can't go on the check-out:", fieldErrors };
  }
  if (chosen.length === 0) return { error: "Choose at least one item." };

  const staff = await staffOptions(group.organizationId, group.campusId);
  // The group's contact, else the campus's default contact, else whoever is making it.
  const staffRepId = staff.some((p) => p.id === group.staffContactId)
    ? group.staffContactId
    : ((await defaultStaffId(group.organizationId, group.campusId, staff, actor.id)) ?? actor.id);

  let checkoutId: string;
  try {
    checkoutId = await db.$transaction(async (tx) => {
      const organization = await tx.organization.update({
        where: { id: group.organizationId },
        data: { checkoutSequence: { increment: 1 } },
        select: { checkoutSequence: true },
      });
      const checkout = await tx.checkout.create({
        data: {
          organizationId: group.organizationId,
          campusId: group.campusId,
          number: organization.checkoutSequence,
          guestGroupId: group.id,
          groupName: group.name,
          guestRepName: group.repName,
          guestRepEmail: group.repEmail,
          guestRepPhone: group.repPhone,
          staffRepId,
          dateOut: group.arrivalDate,
          dateDue: group.departureDate,
          notes: `From ${group.name}'s equipment request.`,
          createdById: actor.id,
          lines: {
            create: chosen.map((itemId) => ({
              organizationId: group.organizationId,
              itemId,
              addedById: actor.id,
            })),
          },
        },
        select: { id: true },
      });
      const { count } = await tx.equipmentRequest.updateMany({
        where: {
          id: request.id,
          status: { in: ["APPROVED", "PARTLY_APPROVED"] },
          OR: [{ checkoutId: null }, { checkout: { status: "CANCELLED" } }],
        },
        data: { checkoutId: checkout.id },
      });
      if (count === 0) throw new RequestChanged();
      return checkout.id;
    });
  } catch (error) {
    if (error instanceof RequestChanged) {
      return { error: "Someone changed this request just now. Reload and try again." };
    }
    if (isUniqueViolation(error)) {
      return {
        error: "One of these items was just put on another check-out. Reload and choose again.",
      };
    }
    throw error;
  }
  revalidatePath("/checkouts");
  refresh(group.id);
  redirect(`/checkouts/${checkoutId}?created=1`);
}

class RequestChanged extends Error {}
