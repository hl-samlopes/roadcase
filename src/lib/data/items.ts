import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client.ts";
import { accessibleCampuses, can, scopeWhere, type Action, type Actor } from "@/lib/authz";
import { db } from "@/lib/db";

export const PAGE_SIZE = 50;

export const sortKeys = ["code", "name", "category", "location", "condition", "updated"] as const;
export type SortKey = (typeof sortKeys)[number];

const optionalUuid = z.uuid().optional().catch(undefined);

/** Inventory list filters from the URL; anything invalid is ignored. */
export const listParamsSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  category: optionalUuid,
  location: optionalUuid,
  condition: optionalUuid,
  sort: z.enum(sortKeys).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});

export type ListParams = z.infer<typeof listParamsSchema>;

export function parseListParams(raw: Record<string, string | string[] | undefined>): ListParams {
  const single = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  return listParamsSchema.parse(single);
}

/** Items the actor may read, narrowed by campus and list filters. */
export function buildItemWhere(
  actor: Actor,
  params: ListParams,
  campusId: string | null,
): Prisma.ItemWhereInput | null {
  const scope = scopeWhere(actor, "item:read");
  if (!scope) return null;
  const filters: Prisma.ItemWhereInput[] = [scope];
  if (campusId) filters.push({ campusId });
  if (params.category) filters.push({ categoryId: params.category });
  if (params.location) filters.push({ locationId: params.location });
  if (params.condition) filters.push({ conditionId: params.condition });
  if (params.q) {
    filters.push({
      OR: [
        { name: { contains: params.q, mode: "insensitive" } },
        { code: { contains: params.q, mode: "insensitive" } },
        { notes: { contains: params.q, mode: "insensitive" } },
      ],
    });
  }
  return { AND: filters };
}

export function itemOrderBy(params: ListParams): Prisma.ItemOrderByWithRelationInput[] {
  const dir = params.dir ?? (params.sort === "updated" ? "desc" : "asc");
  const primary: Record<SortKey, Prisma.ItemOrderByWithRelationInput> = {
    code: { code: dir },
    name: { name: dir },
    category: { category: { name: dir } },
    location: { location: { name: dir } },
    condition: { condition: { position: dir } },
    updated: { updatedAt: dir },
  };
  return [primary[params.sort ?? "code"], { code: "asc" }];
}

export const itemListSelect = {
  id: true,
  code: true,
  name: true,
  campus: { select: { code: true } },
  location: { select: { name: true } },
  department: { select: { name: true } },
  category: { select: { name: true } },
  subcategory: { select: { name: true } },
  condition: { select: { label: true } },
} as const satisfies Prisma.ItemSelect;

export async function listItems(actor: Actor, params: ListParams, campusId: string | null) {
  const where = buildItemWhere(actor, params, campusId);
  if (!where) return { items: [], total: 0, page: 1, pageCount: 1 };
  const total = await db.item.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.page ?? 1, pageCount);
  const items = await db.item.findMany({
    where,
    select: itemListSelect,
    orderBy: itemOrderBy(params),
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  return { items, total, page, pageCount };
}

const itemDetailSelect = {
  id: true,
  organizationId: true,
  campusId: true,
  locationId: true,
  departmentId: true,
  code: true,
  name: true,
  categoryId: true,
  subcategoryId: true,
  conditionId: true,
  notes: true,
  price: true,
  customFields: true,
  primaryPhotoId: true,
  createdAt: true,
  updatedAt: true,
  campus: { select: { code: true, name: true } },
  location: { select: { name: true } },
  department: { select: { name: true } },
  category: { select: { name: true } },
  subcategory: { select: { name: true } },
  condition: { select: { label: true, archivedAt: true } },
  attachments: {
    orderBy: { createdAt: "asc" },
    select: { id: true, kind: true, fileName: true, sizeBytes: true, createdAt: true },
  },
  serviceLogs: {
    orderBy: { serviceDate: "desc" },
    select: {
      id: true,
      serviceDate: true,
      serviceType: true,
      cost: true,
      notes: true,
      ticket: { select: { id: true, number: true } },
    },
  },
  serviceTickets: {
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      createdAt: true,
      organizationId: true,
      campusId: true,
      locationId: true,
      departmentId: true,
    },
  },
} as const satisfies Prisma.ItemSelect;

/**
 * One item, or null when it does not exist or the actor may not read it, so
 * callers answer both cases the same way and never reveal what exists.
 */
export async function getItem(actor: Actor, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const item = await db.item.findUnique({ where: { id }, select: itemDetailSelect });
  if (!item || !can(actor, "item:read", item)) return null;
  return item;
}

export type ItemDetail = NonNullable<Awaited<ReturnType<typeof getItem>>>;

/** An item looked up by its printed code (as scanned), if the actor may read it. */
export async function findItemByCode(actor: Actor, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  if (!code || code.length > 40) return null;
  const item = await db.item.findUnique({
    where: { organizationId_code: { organizationId: actor.organizationId, code } },
    select: {
      id: true,
      organizationId: true,
      campusId: true,
      locationId: true,
      departmentId: true,
    },
  });
  return item && can(actor, "item:read", item) ? item : null;
}

export interface Home {
  value: string;
  label: string;
  campusLabel: string;
  scope: { organizationId: string; campusId: string; locationId: string; departmentId: string };
}

/** Encodes a home (location plus owning department) as one form value. */
export function homeValue(locationId: string, departmentId: string) {
  return `${locationId}:${departmentId}`;
}

/**
 * Location and department pairs the actor may use for `action`: only linked
 * pairs at active locations with active departments.
 */
export async function allowedHomes(actor: Actor, action: Action): Promise<Home[]> {
  const links = await db.departmentLocation.findMany({
    where: {
      department: { organizationId: actor.organizationId, archivedAt: null },
      location: { archivedAt: null, campus: { archivedAt: null } },
    },
    select: {
      departmentId: true,
      locationId: true,
      department: { select: { name: true } },
      location: {
        select: { name: true, campusId: true, campus: { select: { code: true, name: true } } },
      },
    },
    orderBy: [{ location: { campus: { code: "asc" } } }, { location: { name: "asc" } }],
  });
  return links
    .map((link) => ({
      value: homeValue(link.locationId, link.departmentId),
      label: `${link.location.name} · ${link.department.name}`,
      campusLabel: `${link.location.campus.name} (${link.location.campus.code})`,
      scope: {
        organizationId: actor.organizationId,
        campusId: link.location.campusId,
        locationId: link.locationId,
        departmentId: link.departmentId,
      },
    }))
    .filter((home) => can(actor, action, home.scope))
    .sort((a, b) => a.campusLabel.localeCompare(b.campusLabel) || a.label.localeCompare(b.label));
}

/** Choices shown on the item form. */
export async function itemFormOptions(actor: Actor) {
  const organizationId = actor.organizationId;
  const [categories, conditions, fields] = await Promise.all([
    db.category.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        subcategories: {
          where: { archivedAt: null },
          orderBy: [{ position: "asc" }, { name: "asc" }],
          select: { id: true, name: true },
        },
      },
    }),
    db.itemCondition.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: [{ position: "asc" }, { label: "asc" }],
      select: { id: true, label: true, isDefault: true },
    }),
    activeFields(organizationId),
  ]);
  return { categories, conditions, fields };
}

export function activeFields(organizationId: string) {
  return db.fieldDefinition.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

/** Filter choices for the inventory list, limited to campuses the actor can reach. */
export async function listFilterOptions(actor: Actor, campusId: string | null) {
  const campuses = await accessibleCampuses(actor);
  const campusIds = campusId ? [campusId] : campuses.map((c) => c.id);
  const [categories, locations, conditions] = await Promise.all([
    db.category.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    db.location.findMany({
      where: { campusId: { in: campusIds } },
      orderBy: [{ campus: { code: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, campus: { select: { code: true } } },
    }),
    db.itemCondition.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: [{ position: "asc" }, { label: "asc" }],
      select: { id: true, label: true },
    }),
  ]);
  return { categories, locations, conditions };
}

/** What stops an item being deleted: any history at all (check-outs, tickets, service logs). */
export async function itemHistoryCounts(itemId: string) {
  const [tickets, serviceLogs, checkouts] = await Promise.all([
    db.serviceTicket.count({ where: { itemId } }),
    db.serviceLog.count({ where: { itemId } }),
    db.checkoutLine.count({ where: { itemId } }),
  ]);
  return { tickets, serviceLogs, checkouts, any: tickets + serviceLogs + checkouts > 0 };
}
