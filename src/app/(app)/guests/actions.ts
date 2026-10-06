"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageCheckout, requireUser, type CurrentUser } from "@/lib/authz";
import { appUrl } from "@/lib/app-url";
import { appTimeZone, dateInZone } from "@/lib/checkouts/overdue";
import { checkoutCampuses, staffOptions } from "@/lib/data/checkouts";
import { getGuestGroup, issuePortalLink } from "@/lib/data/guest-groups";
import { db } from "@/lib/db";
import { formObject, invalid, type FormState } from "@/lib/forms/state";
import { enqueue } from "@/lib/jobs/boss";
import { portalPath } from "@/lib/portal/token";
import { encryptSecret, secretsConfigured } from "@/lib/secrets";

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };
const PLEASE_FIX = "Please fix the highlighted fields.";
const ARCHIVED: FormState = { error: "This group is archived. Restore it first." };

const detailsSchema = z
  .object({
    name: z.string().trim().min(1, "Enter the group's name.").max(200),
    repName: z.string().trim().min(1, "Enter the representative's name.").max(200),
    repEmail: z
      .email("Enter an email address such as name@example.com.")
      .max(254)
      .transform((value) => value.toLowerCase()),
    repPhone: z
      .string()
      .trim()
      .regex(/^[0-9+().\-\s]{7,30}$/, "Enter a phone number, such as (555) 123-4567."),
    staffContactId: z.uuid("Choose the staff contact."),
    arrivalDate: z.iso.date("Enter the date the group arrives."),
    departureDate: z.iso.date("Enter the date the group leaves."),
    notes: z
      .string()
      .trim()
      .max(5000)
      .transform((value) => value || null),
  })
  .refine((value) => value.departureDate >= value.arrivalDate, {
    path: ["departureDate"],
    message: "The group can't leave before it arrives.",
  });

const day = (value: string) => new Date(`${value}T00:00:00Z`);

const DATES_PASSED: FormState = {
  error:
    "The group's dates have passed, so a new link would already be expired. Change the dates first.",
};

/** Whether a new link would already be expired (more than 14 days after departure). */
const datesPassed = (group: { linkLastDay: string }) =>
  dateInZone(new Date(), appTimeZone()) > group.linkLastDay;

async function checkDetails(campusId: string, organizationId: string, formData: FormData) {
  const parsed = detailsSchema.safeParse({ notes: "", ...formObject(formData) });
  if (!parsed.success) return { ok: false as const, state: invalid(parsed.error) };
  const staff = await staffOptions(organizationId, campusId);
  if (!staff.some((person) => person.id === parsed.data.staffContactId)) {
    return {
      ok: false as const,
      state: {
        error: PLEASE_FIX,
        fieldErrors: { staffContactId: ["Choose someone who runs check-outs at this campus."] },
      } satisfies FormState,
    };
  }
  const { arrivalDate, departureDate, ...rest } = parsed.data;
  return {
    ok: true as const,
    data: { ...rest, arrivalDate: day(arrivalDate), departureDate: day(departureDate) },
  };
}

/** A group the actor manages, or a form error. */
async function managedGroup(actor: CurrentUser, id: string) {
  const group = await getGuestGroup(actor, id);
  if (!group || !canManageCheckout(actor, group)) return { error: NOT_ALLOWED };
  return { group };
}

function refresh(id: string) {
  revalidatePath(`/guests/${id}`);
  revalidatePath("/guests");
}

export async function createGuestGroupAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const campusId = String(formData.get("campusId") ?? "");
  const campus = (await checkoutCampuses(actor, "checkout:manage")).find((c) => c.id === campusId);
  if (!campus) return { error: PLEASE_FIX, fieldErrors: { campusId: ["Choose a campus."] } };
  const details = await checkDetails(campus.id, actor.organizationId, formData);
  if (!details.ok) return details.state;

  const group = await db.guestGroup.create({
    data: {
      organizationId: actor.organizationId,
      campusId: campus.id,
      createdById: actor.id,
      ...details.data,
    },
    select: { id: true },
  });
  revalidatePath("/guests");
  redirect(`/guests/${group.id}?created=1`);
}

export async function updateGuestGroupAction(
  groupId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const { group, error } = await managedGroup(actor, groupId);
  if (!group) return error;
  if (group.archivedAt) return ARCHIVED;
  const details = await checkDetails(group.campusId, actor.organizationId, formData);
  if (!details.ok) return details.state;
  await db.guestGroup.update({ where: { id: group.id }, data: details.data });
  refresh(group.id);
  return { success: "Details saved." };
}

/** Emails the representative a new portal link; any earlier link stops working. */
export async function sendPortalLinkAction(
  groupId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const { group, error } = await managedGroup(actor, groupId);
  if (!group) return error;
  if (group.archivedAt) return ARCHIVED;
  if (datesPassed(group)) return DATES_PASSED;
  if (!secretsConfigured()) {
    // The email job carries the token encrypted; without the key it can't carry it safely.
    return {
      error:
        "Portal links can't be emailed until SECRETS_ENCRYPTION_KEY is set. Copy a link instead.",
    };
  }
  await db.$transaction(async (tx) => {
    const { linkId, token } = await issuePortalLink(tx, group, {
      actorId: actor.id,
      sentTo: group.repEmail,
    });
    await enqueue(
      "email.send",
      {
        organizationId: group.organizationId,
        idempotencyKey: `portal-link:${linkId}`,
        recipient: { email: group.repEmail, name: group.repName },
        template: "portal-link",
        data: { linkId, sealedToken: encryptSecret(token) },
      },
      { tx },
    );
  });
  refresh(group.id);
  return {
    success: `Sent a new portal link to ${group.repEmail}. Any earlier link stops working.`,
  };
}

export interface CopyLinkState extends FormState {
  link?: string;
}

/** Makes a new link to show once, for staff to copy; any earlier link stops working. */
export async function copyPortalLinkAction(
  groupId: string,
  _state: CopyLinkState,
  _formData: FormData,
): Promise<CopyLinkState> {
  const actor = await requireUser();
  const { group, error } = await managedGroup(actor, groupId);
  if (!group) return error;
  if (group.archivedAt) return ARCHIVED;
  if (datesPassed(group)) return DATES_PASSED;
  const { token } = await db.$transaction((tx) =>
    issuePortalLink(tx, group, { actorId: actor.id, sentTo: null }),
  );
  refresh(group.id);
  return {
    success:
      "Made a new portal link. Copy it now: it won't be shown again. Any earlier link stops working.",
    link: appUrl(portalPath(token)),
  };
}

export async function revokePortalLinkAction(
  groupId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const { group, error } = await managedGroup(actor, groupId);
  if (!group) return error;
  const { count } = await db.portalLink.updateMany({
    where: { guestGroupId: group.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  refresh(group.id);
  return {
    success: count > 0 ? "The portal link no longer works." : "There was no link to turn off.",
  };
}

/** Archiving hides the group from the lists and turns its portal link off. */
export async function archiveGuestGroupAction(
  groupId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const { group, error } = await managedGroup(actor, groupId);
  if (!group) return error;
  const now = new Date();
  await db.$transaction([
    db.guestGroup.update({ where: { id: group.id }, data: { archivedAt: now } }),
    db.portalLink.updateMany({
      where: { guestGroupId: group.id, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
  refresh(group.id);
  return { success: "Archived. Its portal link no longer works." };
}

export async function restoreGuestGroupAction(
  groupId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const { group, error } = await managedGroup(actor, groupId);
  if (!group) return error;
  await db.guestGroup.update({ where: { id: group.id }, data: { archivedAt: null } });
  refresh(group.id);
  return { success: "Restored. Send a new portal link when the group needs one." };
}
