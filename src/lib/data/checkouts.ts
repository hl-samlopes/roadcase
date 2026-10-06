import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client.ts";
import type { CheckoutStatus } from "@/generated/prisma/enums.ts";
import {
  can,
  canAddItemToCheckout,
  canManageCheckout,
  checkoutCampusIds,
  checkoutScope,
  scopeWhere,
  type Actor,
} from "@/lib/authz/policy";
import { availability, refusalMessage, type Refusal } from "@/lib/checkouts/availability";
import { appTimeZone, dateInZone } from "@/lib/checkouts/overdue";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/forms/prisma-errors";

/** Statuses in which a check-out still holds its items. */
export const activeCheckoutStatuses: CheckoutStatus[] = [
  "DRAFT",
  "AWAITING_SIGNATURES",
  "OUT",
  "PARTIALLY_RETURNED",
];

const MAX_SEARCH_RESULTS = 20;

/** Campuses (in the organization, not archived) where the actor may do this. */
export async function checkoutCampuses(actor: Actor, action: "checkout:read" | "checkout:manage") {
  const campuses = await db.campus.findMany({
    where: { organizationId: actor.organizationId, archivedAt: null },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  const allowed = new Set(
    checkoutCampusIds(
      actor,
      action,
      campuses.map((c) => c.id),
    ),
  );
  return campuses.filter((c) => allowed.has(c.id));
}

export const checkoutListParamsSchema = z.object({
  status: z.enum(["active", "overdue", "all", "closed"]).optional().catch(undefined),
});

export async function listCheckouts(
  actor: Actor,
  params: z.infer<typeof checkoutListParamsSchema>,
  activeCampusId: string | null,
) {
  const campusIds = (await checkoutCampuses(actor, "checkout:read"))
    .map((c) => c.id)
    .filter((id) => !activeCampusId || id === activeCampusId);
  if (campusIds.length === 0) return [];
  const status = params.status ?? "active";
  return db.checkout.findMany({
    where: {
      organizationId: actor.organizationId,
      campusId: { in: campusIds },
      ...(status === "active"
        ? { status: { in: activeCheckoutStatuses } }
        : status === "overdue"
          ? {
              status: { in: ["OUT", "PARTIALLY_RETURNED"] },
              dateDue: { lt: new Date(`${dateInZone(new Date(), appTimeZone())}T00:00:00Z`) },
            }
          : status === "closed"
            ? { status: { notIn: activeCheckoutStatuses } }
            : {}),
    },
    orderBy: [{ dateOut: "desc" }, { number: "desc" }],
    take: 200,
    select: {
      id: true,
      number: true,
      status: true,
      groupName: true,
      dateOut: true,
      dateDue: true,
      campus: { select: { code: true } },
      staffRep: { select: { displayName: true } },
      _count: { select: { lines: true } },
    },
  });
}

const checkoutDetailSelect = {
  id: true,
  organizationId: true,
  campusId: true,
  number: true,
  status: true,
  groupName: true,
  guestRepName: true,
  guestRepEmail: true,
  guestRepPhone: true,
  staffRepId: true,
  dateOut: true,
  dateDue: true,
  notes: true,
  createdAt: true,
  campus: { select: { code: true, name: true } },
  staffRep: { select: { displayName: true } },
  // Same campus scope as the check-out, so whoever reads one can read the other.
  guestGroup: { select: { id: true, name: true } },
  lines: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fee: true,
      returnedAt: true,
      returnNotes: true,
      returnCondition: { select: { label: true } },
      item: {
        select: {
          id: true,
          code: true,
          name: true,
          conditionId: true,
          condition: { select: { label: true } },
        },
      },
    },
  },
} satisfies Prisma.CheckoutSelect;

/** A check-out the actor may read, or null (also for other organizations). */
export async function getCheckout(actor: Actor, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const checkout = await db.checkout.findFirst({
    where: { id, organizationId: actor.organizationId },
    select: checkoutDetailSelect,
  });
  if (!checkout || !can(actor, "checkout:read", checkoutScope(checkout))) return null;
  return checkout;
}

export type CheckoutDetail = NonNullable<Awaited<ReturnType<typeof getCheckout>>>;

/** Who can be the staff representative: active people who manage check-outs at the campus. */
export async function staffOptions(organizationId: string, campusId: string) {
  const users = await db.user.findMany({
    where: { organizationId, isActive: true },
    orderBy: { displayName: "asc" },
    select: {
      id: true,
      displayName: true,
      organizationId: true,
      isActive: true,
      grants: {
        select: {
          level: true,
          scopeType: true,
          campusId: true,
          locationId: true,
          departmentId: true,
          canSubmitTickets: true,
        },
      },
    },
  });
  return users
    .filter((user) => canManageCheckout(user, { organizationId, campusId }))
    .map((user) => ({ id: user.id, displayName: user.displayName }));
}

const itemSelect = {
  id: true,
  code: true,
  name: true,
  organizationId: true,
  campusId: true,
  locationId: true,
  departmentId: true,
  campus: { select: { code: true } },
  condition: { select: { label: true, availableForCheckout: true } },
  checkoutLines: {
    where: { holdsItem: true },
    take: 1,
    select: { checkout: { select: { id: true, number: true, groupName: true } } },
  },
} satisfies Prisma.ItemSelect;

type LoadedItem = Prisma.ItemGetPayload<{ select: typeof itemSelect }>;

function refusalFor(
  actor: Actor,
  checkout: { id: string; organizationId: string; campusId: string },
  item: LoadedItem | null,
): Refusal | null {
  if (!item || !can(actor, "item:read", item)) return { reason: "not-found" };
  if (!canAddItemToCheckout(actor, checkout, item)) {
    return { reason: "other-campus", campusCode: item.campus.code };
  }
  const held = item.checkoutLines[0]?.checkout;
  return availability(
    {
      code: item.code,
      name: item.name,
      condition: item.condition,
      heldBy: held ? { checkoutId: held.id, number: held.number, groupName: held.groupName } : null,
    },
    checkout.id,
  );
}

export interface AddResult {
  added: { code: string; name: string }[];
  refused: { code: string; name: string | null; message: string }[];
}

/**
 * Adds items by code to a draft check-out the actor manages. Each code is
 * checked on its own and either added or refused with a reason; the unique
 * index on held items settles races with another check-out.
 */
export async function addItemsToCheckout(
  actor: Actor & { id: string },
  checkout: { id: string; organizationId: string; campusId: string },
  codes: string[],
): Promise<AddResult> {
  const items = await db.item.findMany({
    where: { organizationId: actor.organizationId, code: { in: codes } },
    select: itemSelect,
  });
  const byCode = new Map(items.map((item) => [item.code, item]));
  const result: AddResult = { added: [], refused: [] };

  for (const code of codes) {
    const item = byCode.get(code) ?? null;
    const refusal = refusalFor(actor, checkout, item);
    const visibleName = refusal?.reason === "not-found" ? null : (item?.name ?? null);
    if (refusal) {
      result.refused.push({ code, name: visibleName, message: refusalMessage(refusal) });
      continue;
    }
    try {
      await db.checkoutLine.create({
        data: {
          organizationId: checkout.organizationId,
          checkoutId: checkout.id,
          itemId: item!.id,
          addedById: actor.id,
        },
      });
      result.added.push({ code, name: item!.name });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Someone added it to a check-out in the meantime; report who has it now.
      const now = await db.item.findUnique({ where: { id: item!.id }, select: itemSelect });
      const latest = refusalFor(actor, checkout, now) ?? { reason: "already-added" as const };
      result.refused.push({ code, name: item!.name, message: refusalMessage(latest) });
    }
  }
  return result;
}

/** Items at the check-out's campus matching a search, each with why it can't be added (if so). */
export async function searchItemsForCheckout(
  actor: Actor,
  checkout: { id: string; organizationId: string; campusId: string },
  query: string,
) {
  const q = query.trim();
  const scope = scopeWhere(actor, "item:read");
  if (!q || !scope) return [];
  const items = await db.item.findMany({
    where: {
      AND: [
        scope,
        { campusId: checkout.campusId },
        {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { code: { contains: q.toUpperCase() } },
          ],
        },
      ],
    },
    orderBy: { code: "asc" },
    take: MAX_SEARCH_RESULTS,
    select: itemSelect,
  });
  return items.map((item) => {
    const refusal = refusalFor(actor, checkout, item);
    const onThisCheckout = refusal?.reason === "already-added";
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      condition: item.condition.label,
      onThisCheckout,
      refusal: refusal && !onThisCheckout ? refusalMessage(refusal) : null,
    };
  });
}

/** Sum of the fees on a check-out's lines, in cents to avoid floating-point drift. */
export function feeTotalCents(lines: { fee: { toString(): string } | null }[]): number {
  return lines.reduce(
    (sum, line) => sum + (line.fee === null ? 0 : Math.round(Number(line.fee.toString()) * 100)),
    0,
  );
}

/**
 * Items in these categories at a campus that the actor can see, each with
 * why it couldn't go on a new check-out there (null when it can). For
 * turning a guest request into a check-out.
 */
export async function itemsForNewCheckout(
  actor: Actor,
  place: { organizationId: string; campusId: string },
  categoryIds: string[],
) {
  const scope = scopeWhere(actor, "item:read");
  if (!scope || categoryIds.length === 0) return [];
  const items = await db.item.findMany({
    where: { AND: [scope, { campusId: place.campusId, categoryId: { in: categoryIds } }] },
    orderBy: { code: "asc" },
    select: { ...itemSelect, categoryId: true },
  });
  // No check-out exists yet, so any check-out holding an item refuses it.
  const draft = { id: "", ...place };
  return items.map((item) => {
    const refusal = refusalFor(actor, draft, item);
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      categoryId: item.categoryId,
      condition: item.condition.label,
      refusal: refusal ? refusalMessage(refusal) : null,
    };
  });
}
