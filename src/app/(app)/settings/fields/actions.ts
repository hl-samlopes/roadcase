"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FieldType } from "@/generated/prisma/enums.ts";
import { can, requireUser, type CurrentUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { formObject, invalid, type FormState } from "@/lib/forms/state";

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };

const optionsSchema = z
  .string()
  .max(10_000)
  .transform((text) => [
    ...new Set(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ])
  .pipe(z.array(z.string().max(80, "Keep each option under 80 characters.")).max(100));

const baseSchema = z.object({
  label: z.string().trim().min(1, "Enter a name.").max(60),
  required: z
    .literal("on")
    .optional()
    .transform((value) => value === "on"),
  options: z.preprocess((value) => value ?? "", optionsSchema),
});

/** Custom fields apply to the whole organization, so only organization admins manage them. */
async function authorize(): Promise<CurrentUser | null> {
  const actor = await requireUser();
  return can(actor, "fields:manage", { organizationId: actor.organizationId }) ? actor : null;
}

async function findField(actor: CurrentUser, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  return db.fieldDefinition.findFirst({ where: { id, organizationId: actor.organizationId } });
}

function needsOptions(type: FieldType, options: string[]): FormState | null {
  if (type === "DROPDOWN" && options.length === 0) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: { options: ["Add at least one option, one per line."] },
    };
  }
  return null;
}

function refresh() {
  revalidatePath("/settings/fields");
  revalidatePath("/items", "layout");
}

export async function createFieldAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await authorize();
  if (!actor) return NOT_ALLOWED;
  const parsed = baseSchema
    .extend({ type: z.enum(FieldType, "Choose a type.") })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { label, required, type } = parsed.data;
  const options = type === "DROPDOWN" ? parsed.data.options : [];
  const problem = needsOptions(type, options);
  if (problem) return problem;

  const last = await db.fieldDefinition.aggregate({
    where: { organizationId: actor.organizationId },
    _max: { position: true },
  });
  await db.fieldDefinition.create({
    data: {
      organizationId: actor.organizationId,
      // A stable key keeps item values attached when the field is renamed.
      key: `f_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
      label,
      type,
      required,
      options: type === "DROPDOWN" ? options : undefined,
      position: (last._max.position ?? -1) + 1,
    },
  });
  refresh();
  return { success: `Added "${label}".` };
}

export async function updateFieldAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  const field = actor && (await findField(actor, id));
  if (!field) return NOT_ALLOWED;
  const parsed = baseSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const options = field.type === "DROPDOWN" ? parsed.data.options : [];
  const problem = needsOptions(field.type, options);
  if (problem) return problem;

  await db.fieldDefinition.update({
    where: { id: field.id },
    data: {
      label: parsed.data.label,
      required: parsed.data.required,
      ...(field.type === "DROPDOWN" ? { options } : {}),
    },
  });
  refresh();
  return { success: "Saved." };
}

export async function moveFieldAction(
  id: string,
  direction: "up" | "down",
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  const field = actor && (await findField(actor, id));
  if (!actor || !field || field.archivedAt) return NOT_ALLOWED;

  const active = await db.fieldDefinition.findMany({
    where: { organizationId: actor.organizationId, archivedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const index = active.findIndex((row) => row.id === field.id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= active.length) return {};
  const order = active.map((row) => row.id);
  [order[index], order[target]] = [order[target], order[index]];
  await db.$transaction(
    order.map((rowId, position) =>
      db.fieldDefinition.update({ where: { id: rowId }, data: { position } }),
    ),
  );
  refresh();
  return {};
}

/** "Deleting" a field archives it: it disappears from forms but item values are kept. */
export async function setFieldArchivedAction(
  id: string,
  archived: boolean,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await authorize();
  const field = actor && (await findField(actor, id));
  if (!field) return NOT_ALLOWED;
  await db.fieldDefinition.update({
    where: { id: field.id },
    data: { archivedAt: archived ? new Date() : null },
  });
  refresh();
  return {
    success: archived
      ? `Deleted "${field.label}". Its values are archived and come back if you restore it.`
      : `Restored "${field.label}".`,
  };
}
