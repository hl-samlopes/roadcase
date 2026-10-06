import "server-only";
import type { PortalPrincipal } from "@/lib/authz/portal-policy";
import { appTimeZone, dateInZone } from "@/lib/checkouts/overdue";
import { activeCheckoutStatuses } from "@/lib/data/checkouts";
import { db } from "@/lib/db";
import { buildCatalog, kindId } from "@/lib/portal/catalog";
import { reservingStatuses } from "@/lib/portal/requests";

/**
 * Everything the portal reads, always narrowed to the principal's group and
 * campus. Callers check `portalCan` first; nothing here takes an id from the
 * visitor without tying it back to the principal.
 */

/** A guest group's place and dates: what availability is worked out for. */
export interface GroupScope {
  organizationId: string;
  campusId: string;
  guestGroupId: string;
}

interface Dates {
  arrivalDate: Date;
  departureDate: Date;
}

/**
 * Kinds in these categories with how many are free for the group's dates.
 * Free leaves out items held by an overlapping check-out (or still out past
 * its due date) and what other groups were approved for overlapping dates,
 * unless their request already became a check-out (which then holds the
 * items itself).
 */
async function kindsFor(
  scope: GroupScope,
  dates: Dates,
  categories: { id: string; name: string; description: string | null }[],
) {
  const { organizationId, campusId } = scope;
  if (categories.length === 0) return [];
  const items = await db.item.findMany({
    where: {
      organizationId,
      campusId,
      categoryId: { in: categories.map((c) => c.id) },
      condition: { availableForCheckout: true },
    },
    select: { id: true, name: true, categoryId: true, primaryPhotoId: true },
  });

  const today = new Date(`${dateInZone(new Date(), appTimeZone())}T00:00:00Z`);
  const held = await db.checkoutLine.findMany({
    where: {
      holdsItem: true,
      itemId: { in: items.map((i) => i.id) },
      checkout: {
        status: { in: activeCheckoutStatuses },
        OR: [
          { dateOut: { lte: dates.departureDate }, dateDue: { gte: dates.arrivalDate } },
          { status: { in: ["OUT", "PARTIALLY_RETURNED"] }, dateDue: { lt: today } },
        ],
      },
    },
    select: { itemId: true },
  });
  const heldIds = new Set(held.map((line) => line.itemId));

  const approved = await db.equipmentRequestLine.findMany({
    where: {
      quantityApproved: { gt: 0 },
      request: {
        organizationId,
        campusId,
        status: { in: reservingStatuses },
        guestGroupId: { not: scope.guestGroupId },
        OR: [{ checkoutId: null }, { checkout: { status: "CANCELLED" } }],
        guestGroup: {
          archivedAt: null,
          arrivalDate: { lte: dates.departureDate },
          departureDate: { gte: dates.arrivalDate },
        },
      },
    },
    select: { categoryId: true, kindKey: true, quantityApproved: true },
  });
  const reserved = new Map<string, number>();
  for (const line of approved) {
    const id = kindId(line.categoryId, line.kindKey);
    reserved.set(id, (reserved.get(id) ?? 0) + (line.quantityApproved ?? 0));
  }

  return buildCatalog(
    categories,
    items.map((item) => ({
      id: item.id,
      name: item.name,
      categoryId: item.categoryId,
      photoId: item.primaryPhotoId,
      held: heldIds.has(item.id),
    })),
    reserved,
  );
}

/** The portal catalog: the organization's portal categories at the group's campus. */
export async function portalCatalog(principal: PortalPrincipal, dates: Dates) {
  const categories = await db.category.findMany({
    where: { organizationId: principal.organizationId, showInPortal: true, archivedAt: null },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true, name: true, portalDescription: true },
  });
  return kindsFor(
    principal,
    dates,
    categories.map((c) => ({ id: c.id, name: c.name, description: c.portalDescription })),
  );
}

/**
 * How many of each requested kind are free for the group's dates, for staff
 * reviewing it: any category the lines use, shown to guests or not. Keyed by
 * `kindId`; a kind with nothing left is 0.
 */
export async function requestLineAvailability(
  scope: GroupScope,
  dates: Dates,
  lines: { categoryId: string; kindKey: string }[],
) {
  const categoryIds = [...new Set(lines.map((line) => line.categoryId))];
  const sections = await kindsFor(
    scope,
    dates,
    categoryIds.map((id) => ({ id, name: "", description: null })),
  );
  const free = new Map<string, number>();
  for (const { kinds } of sections) {
    for (const kind of kinds) free.set(kindId(kind.categoryId, kind.key), kind.available);
  }
  return free;
}

/** The group's own equipment request, or null if it hasn't started one. */
export function portalRequest(principal: PortalPrincipal) {
  return db.equipmentRequest.findFirst({
    where: { guestGroupId: principal.guestGroupId, organizationId: principal.organizationId },
    select: {
      id: true,
      status: true,
      note: true,
      submittedAt: true,
      staffMessage: true,
      lines: {
        orderBy: { name: "asc" },
        select: {
          categoryId: true,
          kindKey: true,
          name: true,
          quantityRequested: true,
          quantityApproved: true,
          staffNote: true,
        },
      },
    },
  });
}

/**
 * A photo the portal may show: the main photo of an item at the group's
 * campus, in a portal category and a condition that can go out.
 */
export function portalPhoto(principal: PortalPrincipal, attachmentId: string) {
  return db.attachment.findFirst({
    where: {
      id: attachmentId,
      organizationId: principal.organizationId,
      kind: "PHOTO",
      primaryPhotoFor: {
        campusId: principal.campusId,
        category: { showInPortal: true, archivedAt: null },
        condition: { availableForCheckout: true },
      },
    },
    select: { storageKey: true, contentType: true },
  });
}
