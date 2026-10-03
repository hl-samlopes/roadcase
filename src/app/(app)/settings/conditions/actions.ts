"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requireUser, type CurrentUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/forms/prisma-errors";
import { formObject, invalid, type FormState } from "@/lib/forms/state";

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };
const DUPLICATE: FormState = {
  error: "Please fix the highlighted fields.",
  fieldErrors: { label: ["Another condition already has this name."] },
};

const conditionSchema = z.object({
  label: z.string().trim().min(1, "Enter a name.").max(60),
  startsRepairTicket: z
    .literal("on")
    .optional()
    .transform((value) => value === "on"),
});

/** Conditions are organization-wide, so only organization admins manage them. */
async function authorize(): Promise<CurrentUser | null> {
  const actor = await requireUser();
  return can(actor, "conditions:manage", { organizationId: actor.organizationId }) ? actor : null;
}

async function findCondition(actor: CurrentUser, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  return db.itemCondition.findFirst({ where: { id, organizationId: actor.organizationId } });
}

function refresh() {
  revalidatePath("/settings/conditions");
  revalidatePath("/items", "layout");
}

export async function createConditionAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  if (!actor) return NOT_ALLOWED;
  const parsed = conditionSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);

  const last = await db.itemCondition.aggregate({
    where: { organizationId: actor.organizationId },
    _max: { position: true },
  });
  try {
    await db.itemCondition.create({
      data: {
        organizationId: actor.organizationId,
        ...parsed.data,
        position: (last._max.position ?? -1) + 1,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE;
    throw error;
  }
  refresh();
  return { success: `Added "${parsed.data.label}".` };
}

export async function updateConditionAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  const condition = actor && (await findCondition(actor, id));
  if (!condition) return NOT_ALLOWED;
  const parsed = conditionSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    await db.itemCondition.update({ where: { id: condition.id }, data: parsed.data });
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE;
    throw error;
  }
  refresh();
  return { success: "Saved." };
}

export async function moveConditionAction(
  id: string,
  direction: "up" | "down",
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  const condition = actor && (await findCondition(actor, id));
  if (!actor || !condition || condition.archivedAt) return NOT_ALLOWED;

  const active = await db.itemCondition.findMany({
    where: { organizationId: actor.organizationId, archivedAt: null },
    orderBy: [{ position: "asc" }, { label: "asc" }],
    select: { id: true },
  });
  const index = active.findIndex((row) => row.id === condition.id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= active.length) return {};

  const order = active.map((row) => row.id);
  [order[index], order[target]] = [order[target], order[index]];
  await db.$transaction(
    order.map((rowId, position) =>
      db.itemCondition.update({ where: { id: rowId }, data: { position } }),
    ),
  );
  refresh();
  return {};
}

export async function setDefaultConditionAction(
  id: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  const condition = actor && (await findCondition(actor, id));
  if (!actor || !condition || condition.archivedAt) return NOT_ALLOWED;

  await db.$transaction([
    db.itemCondition.updateMany({
      where: { organizationId: actor.organizationId, isDefault: true },
      data: { isDefault: false },
    }),
    db.itemCondition.update({ where: { id: condition.id }, data: { isDefault: true } }),
  ]);
  refresh();
  return { success: `New items now start as "${condition.label}".` };
}

/** Deletes an unused condition, or archives one that items still have. */
export async function removeConditionAction(
  id: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  const condition = actor && (await findCondition(actor, id));
  if (!condition) return NOT_ALLOWED;
  if (condition.isDefault) {
    return { error: "Choose another default condition before removing this one." };
  }

  const inUse = await db.item.count({ where: { conditionId: condition.id } });
  if (inUse > 0) {
    await db.itemCondition.update({
      where: { id: condition.id },
      data: { archivedAt: new Date() },
    });
  } else {
    await db.itemCondition.delete({ where: { id: condition.id } });
  }
  refresh();
  return {
    success:
      inUse > 0
        ? `Archived "${condition.label}". ${inUse} item${inUse === 1 ? " keeps" : "s keep"} it until changed.`
        : `Removed "${condition.label}".`,
  };
}

export async function restoreConditionAction(
  id: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  const condition = actor && (await findCondition(actor, id));
  if (!condition) return NOT_ALLOWED;
  await db.itemCondition.update({ where: { id: condition.id }, data: { archivedAt: null } });
  refresh();
  return { success: `Restored "${condition.label}".` };
}
