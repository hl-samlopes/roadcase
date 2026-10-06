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

/** The catalog for a group's campus and dates. */
export async function portalCatalog(
  principal: PortalPrincipal,
  dates: { arrivalDate: Date; departureDate: Date },
) {
  const { organizationId, campusId } = principal;
  const categories = await db.category.findMany({
    where: { organizationId, showInPortal: true, archivedAt: null },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true, name: true, portalDescription: true },
  });
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

  // Held: on an active check-out whose dates overlap the visit, or still out past its due date.
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

  // Reserved: what other groups at this campus were approved for overlapping dates.
  const approved = await db.equipmentRequestLine.findMany({
    where: {
      quantityApproved: { gt: 0 },
      request: {
        organizationId,
        campusId,
        status: { in: reservingStatuses },
        guestGroupId: { not: principal.guestGroupId },
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
    categories.map((c) => ({ id: c.id, name: c.name, description: c.portalDescription })),
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

/** The group's own equipment request, or null if it hasn't started one. */
export function portalRequest(principal: PortalPrincipal) {
  return db.equipmentRequest.findFirst({
    where: { guestGroupId: principal.guestGroupId, organizationId: principal.organizationId },
    select: {
      id: true,
      status: true,
      note: true,
      submittedAt: true,
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
