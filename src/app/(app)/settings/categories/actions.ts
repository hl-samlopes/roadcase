"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requireUser, type CurrentUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/forms/prisma-errors";
import { formObject, invalid, type FormState } from "@/lib/forms/state";

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };
const nameSchema = z.object({ name: z.string().trim().min(1, "Enter a name.").max(80) });

function duplicate(what: string): FormState {
  return {
    error: "Please fix the highlighted fields.",
    fieldErrors: { name: [`There's already a ${what} with this name.`] },
  };
}

/** Categories are organization-wide, so only organization admins manage them. */
async function authorize(): Promise<CurrentUser | null> {
  const actor = await requireUser();
  return can(actor, "categories:manage", { organizationId: actor.organizationId }) ? actor : null;
}

async function findCategory(actor: CurrentUser, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  return db.category.findFirst({ where: { id, organizationId: actor.organizationId } });
}

async function findSubcategory(actor: CurrentUser, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  return db.subcategory.findFirst({
    where: { id, category: { organizationId: actor.organizationId } },
    include: { category: { select: { name: true } } },
  });
}

function refresh() {
  revalidatePath("/settings/categories");
  revalidatePath("/items", "layout");
}

export async function createCategoryAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  if (!actor) return NOT_ALLOWED;
  const parsed = nameSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const last = await db.category.aggregate({
    where: { organizationId: actor.organizationId },
    _max: { position: true },
  });
  try {
    await db.category.create({
      data: {
        organizationId: actor.organizationId,
        name: parsed.data.name,
        position: (last._max.position ?? -1) + 1,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return duplicate("category");
    throw error;
  }
  refresh();
  return { success: `Added ${parsed.data.name}.` };
}

export async function renameCategoryAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  const category = actor && (await findCategory(actor, id));
  if (!category) return NOT_ALLOWED;
  const parsed = nameSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    await db.category.update({ where: { id: category.id }, data: { name: parsed.data.name } });
  } catch (error) {
    if (isUniqueViolation(error)) return duplicate("category");
    throw error;
  }
  refresh();
  return { success: `Saved ${parsed.data.name}.` };
}

const portalSchema = z.object({
  showInPortal: z.literal("on").optional(),
  portalDescription: z
    .string()
    .trim()
    .max(1000)
    .transform((value) => value || null),
});

/** Whether guest groups see the category in the portal catalog, and what it says to them. */
export async function savePortalCategoryAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  const category = actor && (await findCategory(actor, id));
  if (!category) return NOT_ALLOWED;
  const parsed = portalSchema.safeParse({ portalDescription: "", ...formObject(formData) });
  if (!parsed.success) return invalid(parsed.error);
  const showInPortal = parsed.data.showInPortal === "on";
  await db.category.update({
    where: { id: category.id },
    data: { showInPortal, portalDescription: parsed.data.portalDescription },
  });
  refresh();
  return {
    success: showInPortal
      ? `Guests now see ${category.name} in the portal.`
      : `${category.name} is hidden from guests.`,
  };
}

export async function moveCategoryAction(
  id: string,
  direction: "up" | "down",
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  const category = actor && (await findCategory(actor, id));
  if (!actor || !category || category.archivedAt) return NOT_ALLOWED;
  const active = await db.category.findMany({
    where: { organizationId: actor.organizationId, archivedAt: null },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  const order = active.map((row) => row.id);
  const index = order.indexOf(category.id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= order.length) return {};
  [order[index], order[target]] = [order[target], order[index]];
  await db.$transaction(
    order.map((rowId, position) =>
      db.category.update({ where: { id: rowId }, data: { position } }),
    ),
  );
  refresh();
  return {};
}

/**
 * Deletes a category nothing uses (with its unused subcategories), or
 * archives one that items still have: they keep it, but it can't be chosen.
 */
export async function removeCategoryAction(
  id: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  const category = actor && (await findCategory(actor, id));
  if (!category) return NOT_ALLOWED;
  const used = await db.item.count({ where: { categoryId: category.id } });
  if (used > 0) {
    await db.category.update({ where: { id: category.id }, data: { archivedAt: new Date() } });
    refresh();
    return {
      success: `Archived ${category.name}. Its ${used} item${used === 1 ? " keeps" : "s keep"} it.`,
    };
  }
  await db.$transaction([
    db.subcategory.deleteMany({ where: { categoryId: category.id } }),
    db.category.delete({ where: { id: category.id } }),
  ]);
  refresh();
  return { success: `Deleted ${category.name}.` };
}

export async function restoreCategoryAction(
  id: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  const category = actor && (await findCategory(actor, id));
  if (!category) return NOT_ALLOWED;
  await db.category.update({ where: { id: category.id }, data: { archivedAt: null } });
  refresh();
  return { success: `Restored ${category.name}.` };
}

export async function createSubcategoryAction(
  categoryId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  const category = actor && (await findCategory(actor, categoryId));
  if (!category) return NOT_ALLOWED;
  const parsed = nameSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const last = await db.subcategory.aggregate({
    where: { categoryId: category.id },
    _max: { position: true },
  });
  try {
    await db.subcategory.create({
      data: {
        categoryId: category.id,
        name: parsed.data.name,
        position: (last._max.position ?? -1) + 1,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return duplicate(`subcategory in ${category.name}`);
    throw error;
  }
  refresh();
  return { success: `Added ${parsed.data.name} to ${category.name}.` };
}

export async function renameSubcategoryAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  const subcategory = actor && (await findSubcategory(actor, id));
  if (!subcategory) return NOT_ALLOWED;
  const parsed = nameSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    await db.subcategory.update({
      where: { id: subcategory.id },
      data: { name: parsed.data.name },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return duplicate(`subcategory in ${subcategory.category.name}`);
    throw error;
  }
  refresh();
  return { success: `Saved ${parsed.data.name}.` };
}

/** Deletes an unused subcategory, or archives one that items still have. */
export async function removeSubcategoryAction(
  id: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  const subcategory = actor && (await findSubcategory(actor, id));
  if (!subcategory) return NOT_ALLOWED;
  const used = await db.item.count({ where: { subcategoryId: subcategory.id } });
  if (used > 0) {
    await db.subcategory.update({
      where: { id: subcategory.id },
      data: { archivedAt: new Date() },
    });
    refresh();
    return { success: `Archived ${subcategory.name}.` };
  }
  await db.subcategory.delete({ where: { id: subcategory.id } });
  refresh();
  return { success: `Deleted ${subcategory.name}.` };
}

export async function restoreSubcategoryAction(
  id: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  const subcategory = actor && (await findSubcategory(actor, id));
  if (!subcategory) return NOT_ALLOWED;
  await db.subcategory.update({ where: { id: subcategory.id }, data: { archivedAt: null } });
  refresh();
  return { success: `Restored ${subcategory.name}.` };
}
