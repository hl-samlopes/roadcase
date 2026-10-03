"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManageDepartments, manageableCampuses } from "@/lib/admin/places";
import { can, requireUser, type CurrentUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/forms/prisma-errors";
import { formObject, invalid, type FormState } from "@/lib/forms/state";

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };

const locationSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80),
  code: z
    .string()
    .trim()
    .max(12)
    .transform((value) => value.toUpperCase() || null),
});

const departmentSchema = z.object({ name: z.string().trim().min(1, "Enter a name.").max(80) });

function refresh() {
  revalidatePath("/settings/locations");
  revalidatePath("/", "layout");
}

async function manageableLocation(actor: CurrentUser, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const location = await db.location.findFirst({
    where: { id, organizationId: actor.organizationId },
  });
  if (!location) return null;
  return can(actor, "locations:manage", {
    organizationId: actor.organizationId,
    campusId: location.campusId,
  })
    ? location
    : null;
}

export async function createLocationAction(
  campusId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const campus = (await manageableCampuses(actor)).find((c) => c.id === campusId);
  if (!campus) return NOT_ALLOWED;
  const parsed = locationSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    await db.location.create({
      data: { organizationId: actor.organizationId, campusId: campus.id, ...parsed.data },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: { name: [`${campus.code} already has a location with this name.`] },
      };
    }
    throw error;
  }
  refresh();
  return { success: `Added ${parsed.data.name} to ${campus.code}.` };
}

export async function updateLocationAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const location = await manageableLocation(actor, id);
  if (!location) return NOT_ALLOWED;
  const parsed = locationSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    await db.location.update({ where: { id: location.id }, data: parsed.data });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: { name: ["This campus already has a location with this name."] },
      };
    }
    throw error;
  }
  refresh();
  return { success: "Saved." };
}

/** Archived locations stay on existing items but can't be chosen for new ones. */
export async function setLocationArchivedAction(
  id: string,
  archived: boolean,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const location = await manageableLocation(actor, id);
  if (!location) return NOT_ALLOWED;
  await db.location.update({
    where: { id: location.id },
    data: { archivedAt: archived ? new Date() : null },
  });
  refresh();
  return { success: archived ? `Archived ${location.name}.` : `Restored ${location.name}.` };
}

export async function createDepartmentAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageDepartments(actor)) return NOT_ALLOWED;
  const parsed = departmentSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    await db.department.create({
      data: { organizationId: actor.organizationId, name: parsed.data.name },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: { name: ["A department with this name already exists."] },
      };
    }
    throw error;
  }
  refresh();
  return { success: `Added ${parsed.data.name}.` };
}

async function manageableDepartment(actor: CurrentUser, id: string) {
  if (!canManageDepartments(actor) || !z.uuid().safeParse(id).success) return null;
  return db.department.findFirst({ where: { id, organizationId: actor.organizationId } });
}

export async function updateDepartmentAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const department = await manageableDepartment(actor, id);
  if (!department) return NOT_ALLOWED;
  const parsed = departmentSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    await db.department.update({ where: { id: department.id }, data: parsed.data });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: { name: ["A department with this name already exists."] },
      };
    }
    throw error;
  }
  refresh();
  return { success: "Saved." };
}

export async function setDepartmentArchivedAction(
  id: string,
  archived: boolean,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const department = await manageableDepartment(actor, id);
  if (!department) return NOT_ALLOWED;
  await db.department.update({
    where: { id: department.id },
    data: { archivedAt: archived ? new Date() : null },
  });
  refresh();
  return {
    success: archived ? `Archived ${department.name}.` : `Restored ${department.name}.`,
  };
}

/**
 * Sets the locations a department keeps equipment in. A link can't be removed
 * while items still live there with that department.
 */
export async function setDepartmentLocationsAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const department = await manageableDepartment(actor, id);
  if (!department) return NOT_ALLOWED;

  const chosen = z.array(z.uuid()).safeParse(formData.getAll("locationId"));
  if (!chosen.success) return { error: "Choose locations from the list." };
  const wanted = new Set(chosen.data);

  const [locations, current] = await Promise.all([
    db.location.findMany({
      where: { organizationId: actor.organizationId, id: { in: [...wanted] } },
      select: { id: true },
    }),
    db.departmentLocation.findMany({
      where: { departmentId: department.id },
      select: { locationId: true, location: { select: { name: true } } },
    }),
  ]);
  if (locations.length !== wanted.size) return { error: "Choose locations from the list." };

  const toRemove = current.filter((link) => !wanted.has(link.locationId));
  for (const link of toRemove) {
    const count = await db.item.count({
      where: { departmentId: department.id, locationId: link.locationId },
    });
    if (count > 0) {
      return {
        error: `${link.location.name} still has ${count} ${department.name} item${count === 1 ? "" : "s"}. Move them before removing the location.`,
      };
    }
  }
  const existing = new Set(current.map((link) => link.locationId));
  await db.$transaction([
    db.departmentLocation.deleteMany({
      where: {
        departmentId: department.id,
        locationId: { in: toRemove.map((link) => link.locationId) },
      },
    }),
    db.departmentLocation.createMany({
      data: [...wanted]
        .filter((locationId) => !existing.has(locationId))
        .map((locationId) => ({ departmentId: department.id, locationId })),
    }),
  ]);
  refresh();
  return { success: `Updated where ${department.name} keeps equipment.` };
}
