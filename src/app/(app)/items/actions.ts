"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client.ts";
import { can, requireUser, type CurrentUser } from "@/lib/authz";
import {
  activeFields,
  allowedHomes,
  getItem,
  homeValue,
  itemHistoryCounts,
} from "@/lib/data/items";
import { db } from "@/lib/db";
import { formObject, invalid, type FormState } from "@/lib/forms/state";
import { parseCustomFieldInput } from "@/lib/items/custom-fields";
import { createTicket, findOpenTicket, openTicketStatuses } from "@/lib/data/tickets";
import { deleteObject } from "@/lib/storage";
import { readUpload, storeUpload } from "@/lib/uploads";

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };
const PLEASE_FIX = "Please fix the highlighted fields.";

const itemSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(200),
  home: z.string().min(1, "Choose where the item lives."),
  category: z.uuid("Choose a category."),
  subcategory: z
    .string()
    .transform((value) => value || null)
    .pipe(z.uuid().nullable()),
  condition: z.uuid("Choose a condition."),
  price: z
    .string()
    .trim()
    .transform((value) => value.replace(/[$,]/g, ""))
    .refine(
      (value) => value === "" || /^\d{1,10}(\.\d{1,2})?$/.test(value),
      "Enter an amount such as 125.00.",
    )
    .transform((value) => value || null),
  notes: z
    .string()
    .trim()
    .max(5000)
    .transform((value) => value || null),
});

type ItemInput = z.infer<typeof itemSchema>;

/** Validates the form, including choices that must belong to this organization. */
async function validateItem(actor: CurrentUser, formData: FormData, existingCustom: unknown) {
  const raw = formObject(formData);
  const parsed = itemSchema.safeParse({ subcategory: "", price: "", notes: "", ...raw });
  if (!parsed.success) return { ok: false, state: invalid(parsed.error) } as const;
  const input = parsed.data;
  const fieldErrors: Record<string, string[]> = {};

  const [category, condition, fields] = await Promise.all([
    db.category.findFirst({
      where: { id: input.category, organizationId: actor.organizationId, archivedAt: null },
      select: { id: true, subcategories: { where: { archivedAt: null }, select: { id: true } } },
    }),
    db.itemCondition.findFirst({
      where: { id: input.condition, organizationId: actor.organizationId },
      select: { id: true, label: true, archivedAt: true, startsRepairTicket: true },
    }),
    activeFields(actor.organizationId),
  ]);
  if (!category) fieldErrors.category = ["Choose a category."];
  if (
    input.subcategory &&
    !category?.subcategories.some((subcategory) => subcategory.id === input.subcategory)
  ) {
    fieldErrors.subcategory = ["Choose a subcategory of the selected category."];
  }
  if (!condition) fieldErrors.condition = ["Choose a condition."];

  const custom = parseCustomFieldInput(fields, raw, existingCustom);
  Object.assign(fieldErrors, custom.errors);

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, state: { error: PLEASE_FIX, fieldErrors } as FormState } as const;
  }
  return { ok: true, input, condition: condition!, customFields: custom.values } as const;
}

async function homeFor(actor: CurrentUser, value: string, action: "item:create" | "item:update") {
  return (await allowedHomes(actor, action)).find((home) => home.value === value) ?? null;
}

function itemData(input: ItemInput) {
  return {
    name: input.name,
    categoryId: input.category,
    subcategoryId: input.subcategory,
    conditionId: input.condition,
    price: input.price,
    notes: input.notes,
  };
}

export async function createItemAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireUser();
  const validated = await validateItem(actor, formData, {});
  if (!validated.ok) return validated.state;
  const { input, condition, customFields } = validated;
  if (condition.archivedAt) {
    return { error: PLEASE_FIX, fieldErrors: { condition: ["Choose a condition."] } };
  }

  const home = await homeFor(actor, input.home, "item:create");
  if (!home)
    return { error: PLEASE_FIX, fieldErrors: { home: ["Choose a home you can add items to."] } };

  const photo = await readUpload(formData, "photo", { photoOnly: true });
  if (photo && !photo.ok) return { error: PLEASE_FIX, fieldErrors: { photo: [photo.error] } };
  const stored = photo?.ok ? await storeUpload(actor.organizationId, photo) : null;

  let itemId: string;
  try {
    itemId = await db.$transaction(async (tx) => {
      // Issue the next code for the campus, e.g. HNE-000124.
      const campus = await tx.campus.update({
        where: { id: home.scope.campusId },
        data: { itemSequence: { increment: 1 } },
        select: { code: true, itemSequence: true },
      });
      const item = await tx.item.create({
        data: {
          ...itemData(input),
          customFields: customFields as Prisma.InputJsonValue,
          code: `${campus.code}-${String(campus.itemSequence).padStart(6, "0")}`,
          organizationId: actor.organizationId,
          campusId: home.scope.campusId,
          locationId: home.scope.locationId,
          departmentId: home.scope.departmentId,
          createdById: actor.id,
          updatedById: actor.id,
        },
        select: { id: true },
      });
      if (stored) {
        const attachment = await tx.attachment.create({
          data: { ...stored, itemId: item.id, uploadedById: actor.id },
          select: { id: true },
        });
        await tx.item.update({ where: { id: item.id }, data: { primaryPhotoId: attachment.id } });
      }
      if (condition.startsRepairTicket) {
        await createTicket(tx, {
          item: { id: item.id, ...home.scope },
          title: `${condition.label}: reported when the item was added`,
          description: null,
          reporterId: actor.id,
        });
      }
      return item.id;
    });
  } catch (error) {
    if (stored) await deleteObject(stored.storageKey).catch(() => {});
    throw error;
  }

  revalidatePath("/items");
  redirect(`/items/${itemId}?created=1`);
}

export async function updateItemAction(
  itemId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const item = await getItem(actor, itemId);
  if (!item || !can(actor, "item:update", item)) return NOT_ALLOWED;

  const validated = await validateItem(actor, formData, item.customFields);
  if (!validated.ok) return validated.state;
  const { input, condition, customFields } = validated;
  // An archived condition may stay on an item that already has it.
  if (condition.archivedAt && condition.id !== item.conditionId) {
    return { error: PLEASE_FIX, fieldErrors: { condition: ["Choose a condition."] } };
  }

  // Moving an item needs edit rights at both the old and the new home. The
  // current home stays valid even if its location was archived since.
  const current = homeValue(item.locationId, item.departmentId);
  const home =
    input.home === current
      ? {
          scope: {
            organizationId: item.organizationId,
            campusId: item.campusId,
            locationId: item.locationId,
            departmentId: item.departmentId,
          },
        }
      : await homeFor(actor, input.home, "item:update");
  if (!home)
    return { error: PLEASE_FIX, fieldErrors: { home: ["Choose a home you can edit items in."] } };

  const scope = {
    campusId: home.scope.campusId,
    locationId: home.scope.locationId,
    departmentId: home.scope.departmentId,
  };
  const ticket = await db.$transaction(async (tx) => {
    await tx.item.update({
      where: { id: item.id },
      data: {
        ...itemData(input),
        customFields: customFields as Prisma.InputJsonValue,
        ...scope,
        updatedById: actor.id,
      },
    });
    // Open tickets follow the item to its new home; closed ones keep their history.
    await tx.serviceTicket.updateMany({
      where: { itemId: item.id, status: { in: openTicketStatuses } },
      data: scope,
    });
    // Changing to a condition that starts a repair ticket opens one, unless
    // the item already has an open ticket.
    if (
      condition.startsRepairTicket &&
      condition.id !== item.conditionId &&
      !(await findOpenTicket(tx, item.id))
    ) {
      return createTicket(tx, {
        item: { id: item.id, organizationId: item.organizationId, ...scope },
        title: `Condition set to ${condition.label}`,
        description: null,
        reporterId: actor.id,
      });
    }
    return null;
  });
  revalidatePath("/items");
  revalidatePath(`/items/${item.id}`);
  redirect(`/items/${item.id}?saved=1${ticket ? `&ticket=${ticket.number}` : ""}`);
}

async function editableItem(actor: CurrentUser, itemId: string) {
  const item = await getItem(actor, itemId);
  return item && can(actor, "item:update", item) ? item : null;
}

export async function uploadAttachmentAction(
  itemId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const item = await editableItem(actor, itemId);
  if (!item) return NOT_ALLOWED;

  const upload = await readUpload(formData, "file");
  if (!upload) return { error: PLEASE_FIX, fieldErrors: { file: ["Choose a file to upload."] } };
  if (!upload.ok) return { error: PLEASE_FIX, fieldErrors: { file: [upload.error] } };

  const stored = await storeUpload(actor.organizationId, upload);
  try {
    await db.$transaction(async (tx) => {
      const attachment = await tx.attachment.create({
        data: { ...stored, itemId: item.id, uploadedById: actor.id },
        select: { id: true },
      });
      // The first photo becomes the item's main photo.
      if (stored.kind === "PHOTO" && !item.primaryPhotoId) {
        await tx.item.update({ where: { id: item.id }, data: { primaryPhotoId: attachment.id } });
      }
    });
  } catch (error) {
    await deleteObject(stored.storageKey).catch(() => {});
    throw error;
  }
  revalidatePath(`/items/${item.id}`);
  return { success: `Uploaded ${upload.fileName}.` };
}

export async function deleteAttachmentAction(
  itemId: string,
  attachmentId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const item = await editableItem(actor, itemId);
  const attachment = item
    ? await db.attachment.findFirst({ where: { id: attachmentId, itemId: item.id } })
    : null;
  if (!item || !attachment) return NOT_ALLOWED;

  // Deleting clears the item's main photo through the foreign key (SET NULL).
  await db.attachment.delete({ where: { id: attachment.id } });
  await deleteObject(attachment.storageKey).catch(() => {});
  revalidatePath(`/items/${item.id}`);
  return { success: `Deleted ${attachment.fileName}.` };
}

export async function setPrimaryPhotoAction(
  itemId: string,
  attachmentId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const item = await editableItem(actor, itemId);
  const photo = item
    ? await db.attachment.findFirst({ where: { id: attachmentId, itemId: item.id, kind: "PHOTO" } })
    : null;
  if (!item || !photo) return NOT_ALLOWED;

  await db.item.update({ where: { id: item.id }, data: { primaryPhotoId: photo.id } });
  revalidatePath(`/items/${item.id}`);
  return { success: "Main photo updated." };
}

const serviceSchema = z.object({
  serviceDate: z.iso.date("Enter the service date."),
  serviceType: z.string().trim().min(1, "Enter the type of service.").max(80),
  cost: z
    .string()
    .trim()
    .transform((value) => value.replace(/[$,]/g, ""))
    .refine(
      (value) => value === "" || /^\d{1,10}(\.\d{1,2})?$/.test(value),
      "Enter an amount such as 45.00.",
    )
    .transform((value) => value || null),
  notes: z
    .string()
    .trim()
    .max(5000)
    .transform((value) => value || null),
});

/** Records service on an item directly, without a ticket (routine maintenance, inspections). */
export async function logServiceAction(
  itemId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const item = await getItem(actor, itemId);
  if (!item || !can(actor, "serviceLog:manage", item)) return NOT_ALLOWED;
  const parsed = serviceSchema.safeParse({ cost: "", notes: "", ...formObject(formData) });
  if (!parsed.success) return invalid(parsed.error);

  const upload = await readUpload(formData, "file");
  if (upload && !upload.ok) {
    return { error: PLEASE_FIX, fieldErrors: { file: [upload.error] } };
  }
  const stored = upload ? await storeUpload(actor.organizationId, upload) : null;
  try {
    await db.$transaction(async (tx) => {
      const log = await tx.serviceLog.create({
        data: {
          organizationId: item.organizationId,
          campusId: item.campusId,
          locationId: item.locationId,
          departmentId: item.departmentId,
          itemId: item.id,
          serviceDate: new Date(`${parsed.data.serviceDate}T00:00:00Z`),
          serviceType: parsed.data.serviceType,
          cost: parsed.data.cost,
          notes: parsed.data.notes,
          createdById: actor.id,
        },
        select: { id: true },
      });
      if (stored) {
        await tx.attachment.create({
          data: { ...stored, serviceLogId: log.id, uploadedById: actor.id },
        });
      }
    });
  } catch (error) {
    if (stored) await deleteObject(stored.storageKey).catch(() => {});
    throw error;
  }
  revalidatePath(`/items/${item.id}`);
  revalidatePath("/service-log");
  return { success: `Logged ${parsed.data.serviceType}.` };
}

/**
 * Deletes an item that has no history (never on a check-out, no tickets, no
 * service logs), with its photos and documents. Anything with history stays:
 * staff retire it by changing its condition instead. Its code isn't reused.
 */
export async function deleteItemAction(
  itemId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const item = await getItem(actor, itemId);
  if (!item || !can(actor, "item:delete", item)) return NOT_ALLOWED;
  if ((await itemHistoryCounts(item.id)).any) {
    return {
      error: "This item has history, so it can't be deleted. Change its condition instead.",
    };
  }
  const files = await db.attachment.findMany({
    where: { itemId: item.id },
    select: { storageKey: true },
  });
  await db.item.delete({ where: { id: item.id } });
  await Promise.all(files.map((file) => deleteObject(file.storageKey).catch(() => {})));
  revalidatePath("/items");
  redirect(`/items?deleted=${encodeURIComponent(`${item.code} ${item.name}`)}`);
}
