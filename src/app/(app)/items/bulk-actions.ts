"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requireUser } from "@/lib/authz";
import { allowedHomes, getItem, itemFormOptions } from "@/lib/data/items";
import { createTicket, findOpenTicket, openTicketStatuses } from "@/lib/data/tickets";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/forms/state";
import { MAX_BULK_ITEMS } from "@/lib/items/bulk";

/**
 * Applies the same change to many items: category (and subcategory), home or
 * condition. A field left on "Keep" is untouched. Each item is checked on its
 * own: items the person can't edit are skipped and listed. As with a single
 * edit, open tickets follow an item to its new home, and a condition that
 * starts a repair ticket opens one for each item without an open ticket.
 */
export async function bulkEditAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireUser();
  const ids = z
    .array(z.uuid())
    .max(MAX_BULK_ITEMS)
    .safeParse([...new Set(formData.getAll("id").map(String))]);
  if (!ids.success || ids.data.length === 0) {
    return { error: `Select between 1 and ${MAX_BULK_ITEMS} items.` };
  }
  const categoryChoice = String(formData.get("category") ?? "");
  const homeChoice = String(formData.get("home") ?? "");
  const conditionChoice = String(formData.get("condition") ?? "");
  if (!categoryChoice && !homeChoice && !conditionChoice) {
    return { error: "Choose at least one change." };
  }

  const options = await itemFormOptions(actor);
  let category: { categoryId: string; subcategoryId: string | null } | null = null;
  if (categoryChoice) {
    const [categoryId, subcategoryId = null] = categoryChoice.split(":");
    const found = options.categories.find((c) => c.id === categoryId);
    if (!found || (subcategoryId && !found.subcategories.some((s) => s.id === subcategoryId))) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: { category: ["Choose a category."] },
      };
    }
    category = { categoryId, subcategoryId };
  }
  const condition = conditionChoice
    ? await db.itemCondition.findFirst({
        where: { id: conditionChoice, organizationId: actor.organizationId, archivedAt: null },
        select: { id: true, label: true, startsRepairTicket: true },
      })
    : null;
  if (conditionChoice && !condition) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: { condition: ["Choose a condition."] },
    };
  }
  const home = homeChoice
    ? ((await allowedHomes(actor, "item:update")).find((h) => h.value === homeChoice) ?? null)
    : null;
  if (homeChoice && !home) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: { home: ["Choose a home you can edit items in."] },
    };
  }

  const items = await Promise.all(ids.data.map((id) => getItem(actor, id)));
  const editable = items.filter(
    (item): item is NonNullable<typeof item> => !!item && can(actor, "item:update", item),
  );
  const skipped = ids.data.length - editable.length;
  if (editable.length === 0) return { error: "You can't edit any of the selected items." };

  const opened = await db.$transaction(async (tx) => {
    const tickets: number[] = [];
    for (const item of editable) {
      const scope = home
        ? {
            campusId: home.scope.campusId,
            locationId: home.scope.locationId,
            departmentId: home.scope.departmentId,
          }
        : { campusId: item.campusId, locationId: item.locationId, departmentId: item.departmentId };
      await tx.item.update({
        where: { id: item.id },
        data: {
          ...(category ?? {}),
          ...(condition ? { conditionId: condition.id } : {}),
          ...(home ? scope : {}),
          updatedById: actor.id,
        },
      });
      if (home) {
        await tx.serviceTicket.updateMany({
          where: { itemId: item.id, status: { in: openTicketStatuses } },
          data: scope,
        });
      }
      if (
        condition?.startsRepairTicket &&
        condition.id !== item.conditionId &&
        !(await findOpenTicket(tx, item.id))
      ) {
        const ticket = await createTicket(tx, {
          item: { id: item.id, organizationId: item.organizationId, ...scope },
          title: `Condition set to ${condition.label}`,
          description: null,
          reporterId: actor.id,
        });
        tickets.push(ticket.number);
      }
    }
    return tickets;
  });

  revalidatePath("/items", "layout");
  revalidatePath("/tickets");
  const parts = [`Updated ${editable.length} item${editable.length === 1 ? "" : "s"}.`];
  if (opened.length > 0) {
    parts.push(
      `Opened repair ticket${opened.length === 1 ? "" : "s"} ${opened.map((n) => `#${n}`).join(", ")}.`,
    );
  }
  if (skipped > 0) {
    parts.push(`Skipped ${skipped} you can't edit.`);
  }
  return { success: parts.join(" ") };
}
