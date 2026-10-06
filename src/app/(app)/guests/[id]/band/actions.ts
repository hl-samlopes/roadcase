"use server";

import { revalidatePath } from "next/cache";
import { canManageCheckout, requireUser, type CurrentUser } from "@/lib/authz";
import { channelListSchema, type Channel } from "@/lib/band/input-list";
import { staffBand } from "@/lib/data/band";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/forms/state";
import { enqueue } from "@/lib/jobs/boss";

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };

/** The group's band, if the actor runs check-outs at its campus. */
async function manageable(actor: CurrentUser, groupId: string) {
  const band = await staffBand(actor, groupId);
  if (!band || band.group.archivedAt || !canManageCheckout(actor, band.group)) return null;
  return band;
}

function refresh(groupId: string) {
  revalidatePath(`/guests/${groupId}`, "layout");
  revalidatePath("/portal/[token]/band", "page");
}

/**
 * Writes staff's list (creating it the first time), bumps its version and,
 * if the group can see it, queues the PDF for the new version.
 */
async function writeList(
  actor: CurrentUser,
  band: NonNullable<Awaited<ReturnType<typeof manageable>>>,
  channels: Channel[],
  options: { rebuilt?: boolean; share?: boolean } = {},
) {
  const basedOn = band.setup?.submittedAt ?? null;
  await db.$transaction(async (tx) => {
    const list = band.list
      ? await tx.inputList.update({
          where: { id: band.list.id },
          data: {
            channels,
            editedAt: new Date(),
            editedById: actor.id,
            version: { increment: 1 },
            ...(options.rebuilt ? { basedOnSubmittedAt: basedOn } : {}),
            ...(options.share ? { sharedAt: new Date() } : {}),
          },
          select: { id: true, version: true, sharedAt: true },
        })
      : await tx.inputList.create({
          data: {
            organizationId: band.group.organizationId,
            guestGroupId: band.group.id,
            channels,
            basedOnSubmittedAt: basedOn,
            editedById: actor.id,
            ...(options.share ? { sharedAt: new Date() } : {}),
          },
          select: { id: true, version: true, sharedAt: true },
        });
    if (list.sharedAt) {
      await enqueue(
        "inputlist.pdf",
        { organizationId: band.group.organizationId, inputListId: list.id, version: list.version },
        { tx, key: `${list.id}:${list.version}` },
      );
    }
  });
}

export async function saveInputListAction(
  groupId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const band = await manageable(actor, groupId);
  if (!band) return NOT_ALLOWED;
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("channels") ?? "[]"));
  } catch {
    return { error: "The list couldn't be read. Reload the page and try again." };
  }
  const parsed = channelListSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await writeList(actor, band, parsed.data);
  refresh(band.group.id);
  return {
    success: band.list?.sharedAt
      ? `Saved ${parsed.data.length} channels. The group sees the new list; the PDF is being remade.`
      : `Saved ${parsed.data.length} channels. The group won't see your changes until you share the list.`,
  };
}

/** Replaces staff's list with one made from the group's latest band setup. */
export async function rebuildInputListAction(
  groupId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const band = await manageable(actor, groupId);
  if (!band) return NOT_ALLOWED;
  await writeList(actor, band, band.generated, { rebuilt: true });
  refresh(band.group.id);
  return { success: `Rebuilt from the group's band: ${band.generated.length} channels.` };
}

/** Shows the list (staff's, or the one made from the setup) in the group's portal, with a PDF. */
export async function shareInputListAction(
  groupId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const band = await manageable(actor, groupId);
  if (!band) return NOT_ALLOWED;
  if (!band.list && band.generated.length === 0) {
    return { error: "There's nothing to share yet: the group hasn't sent a band." };
  }
  await writeList(actor, band, band.list?.channels ?? band.generated, {
    share: true,
    rebuilt: !band.list,
  });
  refresh(band.group.id);
  return { success: "Shared with the group. The PDF will be ready in a moment." };
}
