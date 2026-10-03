import "server-only";
import { z } from "zod";
import { can, scopeWhere, type Actor } from "@/lib/authz";
import { db } from "@/lib/db";

const itemSelect = {
  id: true,
  organizationId: true,
  campusId: true,
  locationId: true,
  departmentId: true,
  code: true,
  name: true,
  condition: true,
  notes: true,
  campus: { select: { code: true, name: true } },
  location: { select: { name: true } },
  department: { select: { name: true } },
  category: { select: { name: true } },
  subcategory: { select: { name: true } },
} as const;

/** Items the actor may read. Step 4 adds search, filters and pagination. */
export async function listItems(actor: Actor) {
  const where = scopeWhere(actor, "item:read");
  if (!where) return [];
  return db.item.findMany({ where, select: itemSelect, orderBy: { code: "asc" }, take: 200 });
}

/**
 * One item, or null when it does not exist or the actor may not read it, so
 * callers answer both cases the same way and never reveal what exists.
 */
export async function getItem(actor: Actor, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const item = await db.item.findUnique({ where: { id }, select: itemSelect });
  if (!item || !can(actor, "item:read", item)) return null;
  return item;
}
