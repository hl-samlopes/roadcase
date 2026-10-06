"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requireUser, type CurrentUser } from "@/lib/authz";
import { channelListSchema } from "@/lib/band/input-list";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/forms/prisma-errors";
import { formObject, invalid, type FormState } from "@/lib/forms/state";

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };
const nameSchema = z.object({ name: z.string().trim().min(1, "Enter a name.").max(60) });
const DUPLICATE: FormState = {
  error: "Please fix the highlighted fields.",
  fieldErrors: { name: ["This campus already has a position with this name."] },
};

/** Campus admins (and organization admins) edit a campus's band positions. */
async function editableCampus(actor: CurrentUser, campusId: string) {
  if (!z.uuid().safeParse(campusId).success) return null;
  const campus = await db.campus.findFirst({
    where: { id: campusId, organizationId: actor.organizationId, archivedAt: null },
    select: { id: true },
  });
  return campus &&
    can(actor, "bandPositions:manage", { organizationId: actor.organizationId, campusId })
    ? campus
    : null;
}

async function editablePosition(actor: CurrentUser, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const position = await db.bandPosition.findFirst({
    where: { id, organizationId: actor.organizationId },
    select: {
      id: true,
      campusId: true,
      name: true,
      archivedAt: true,
      _count: { select: { members: true } },
    },
  });
  return position && (await editableCampus(actor, position.campusId)) ? position : null;
}

function refresh(campusId: string) {
  revalidatePath(`/settings/band-positions/${campusId}`);
  revalidatePath("/portal/[token]/band", "page");
}

export async function createBandPositionAction(
  campusId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const campus = await editableCampus(actor, campusId);
  if (!campus) return NOT_ALLOWED;
  const parsed = nameSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const last = await db.bandPosition.aggregate({
    where: { campusId },
    _max: { position: true },
  });
  try {
    await db.bandPosition.create({
      data: {
        organizationId: actor.organizationId,
        campusId,
        name: parsed.data.name,
        position: (last._max.position ?? -1) + 1,
        inputs: [{ source: parsed.data.name, connection: "MIC", stand: "", notes: "" }],
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE;
    throw error;
  }
  refresh(campusId);
  return { success: `Added ${parsed.data.name}. Set its inputs below.` };
}

/** Renames a position and replaces its inputs (sent as JSON by the editor). */
export async function saveBandPositionAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const position = await editablePosition(actor, id);
  if (!position) return NOT_ALLOWED;
  const name = nameSchema.safeParse(formObject(formData));
  if (!name.success) return invalid(name.error);
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("inputs") ?? "[]"));
  } catch {
    return { error: "The inputs couldn't be read. Reload the page and try again." };
  }
  const inputs = channelListSchema.min(1, "A position needs at least one input.").safeParse(raw);
  if (!inputs.success) return { error: inputs.error.issues[0].message };
  try {
    await db.bandPosition.update({
      where: { id: position.id },
      data: { name: name.data.name, inputs: inputs.data },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE;
    throw error;
  }
  refresh(position.campusId);
  return { success: `Saved ${name.data.name}.` };
}

export async function moveBandPositionAction(
  id: string,
  direction: "up" | "down",
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const position = await editablePosition(actor, id);
  if (!position || position.archivedAt) return NOT_ALLOWED;
  const active = await db.bandPosition.findMany({
    where: { campusId: position.campusId, archivedAt: null },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  const index = active.findIndex((p) => p.id === id);
  const swap = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swap < 0 || swap >= active.length) return { success: "Already there." };
  [active[index], active[swap]] = [active[swap], active[index]];
  await db.$transaction(
    active.map((p, order) =>
      db.bandPosition.update({ where: { id: p.id }, data: { position: order } }),
    ),
  );
  refresh(position.campusId);
  return { success: `Moved ${position.name} ${direction}.` };
}

/** Deletes a position no band has used; one that was used is archived, so its bands keep it. */
export async function removeBandPositionAction(
  id: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const position = await editablePosition(actor, id);
  if (!position) return NOT_ALLOWED;
  if (position._count.members > 0) {
    await db.bandPosition.update({ where: { id }, data: { archivedAt: new Date() } });
    refresh(position.campusId);
    return {
      success: `Archived ${position.name}: guests can't choose it, and bands that used it keep it.`,
    };
  }
  await db.bandPosition.delete({ where: { id } });
  refresh(position.campusId);
  return { success: `Deleted ${position.name}.` };
}

export async function restoreBandPositionAction(
  id: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const position = await editablePosition(actor, id);
  if (!position) return NOT_ALLOWED;
  await db.bandPosition.update({ where: { id }, data: { archivedAt: null } });
  refresh(position.campusId);
  return { success: `Restored ${position.name}.` };
}
