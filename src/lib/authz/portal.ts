import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { isThrottled, recordFailure, type ThrottleKey } from "@/lib/auth/throttle";
import { clientAddress, portalAddressKey, portalAddressLimit } from "@/lib/auth/throttle-policy";
import { appTimeZone, dateInZone } from "@/lib/checkouts/overdue";
import { db } from "@/lib/db";
import { hashPortalToken, isPortalTokenShape } from "@/lib/portal/token";
import { portalLinkLastDay, portalLinkStatus, type PortalPrincipal } from "./portal-policy";

/** How often opening the portal updates the link's "last used" time. */
const TOUCH_INTERVAL_MS = 5 * 60_000;

/**
 * The guest group a portal token belongs to, or null. Null covers every
 * failure alike (unknown, revoked, expired, archived, or an address locked
 * out for trying too many bad links), so callers answer with the same 404.
 * Cached per request, so the page and its metadata share one lookup.
 */
export const resolvePortal = cache(async (token: string) => {
  const address = clientAddress(await headers());
  const keys: ThrottleKey[] = address
    ? [{ key: portalAddressKey(address), limit: portalAddressLimit }]
    : [];
  if (keys.length > 0 && (await isThrottled(keys))) return null;

  const link = isPortalTokenShape(token)
    ? await db.portalLink.findUnique({
        where: { tokenHash: hashPortalToken(token) },
        select: {
          id: true,
          revokedAt: true,
          lastUsedAt: true,
          guestGroup: {
            select: {
              id: true,
              organizationId: true,
              campusId: true,
              name: true,
              repName: true,
              arrivalDate: true,
              departureDate: true,
              archivedAt: true,
              campus: { select: { name: true } },
              staffContact: { select: { displayName: true, email: true, isActive: true } },
            },
          },
        },
      })
    : null;
  const today = dateInZone(new Date(), appTimeZone());
  if (!link || portalLinkStatus(link, link.guestGroup, today) !== "active") {
    if (keys.length > 0) await recordFailure(keys);
    return null;
  }

  const now = new Date();
  if (!link.lastUsedAt || now.getTime() - link.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.portalLink.update({ where: { id: link.id }, data: { lastUsedAt: now } });
  }

  const group = link.guestGroup;
  const principal: PortalPrincipal = {
    kind: "portal",
    organizationId: group.organizationId,
    campusId: group.campusId,
    guestGroupId: group.id,
    linkId: link.id,
  };
  return {
    principal,
    group: {
      name: group.name,
      repName: group.repName,
      arrivalDate: group.arrivalDate,
      departureDate: group.departureDate,
      campusName: group.campus.name,
      staffContact: group.staffContact?.isActive
        ? { name: group.staffContact.displayName, email: group.staffContact.email }
        : null,
    },
    lastDay: portalLinkLastDay(group.departureDate),
  };
});

export type PortalContext = NonNullable<Awaited<ReturnType<typeof resolvePortal>>>;
