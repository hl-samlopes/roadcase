import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client.ts";
import { can, checkoutScope, type Actor } from "@/lib/authz/policy";
import { portalLinkLastDay, portalLinkStatus } from "@/lib/authz/portal-policy";
import { appTimeZone, dateInZone } from "@/lib/checkouts/overdue";
import { checkoutCampuses } from "@/lib/data/checkouts";
import { db } from "@/lib/db";
import { hashPortalToken, newPortalToken } from "@/lib/portal/token";

/**
 * Guest groups are campus-level, like check-outs: seeing them (with their
 * contact details) needs `checkout:read` at the campus, and managing them or
 * their portal links needs `checkout:manage`.
 */

export const guestGroupListParamsSchema = z.object({
  view: z.enum(["upcoming", "past", "archived"]).optional().catch(undefined),
});

const todayDate = () => new Date(`${dateInZone(new Date(), appTimeZone())}T00:00:00Z`);

export async function listGuestGroups(
  actor: Actor,
  params: z.infer<typeof guestGroupListParamsSchema>,
  activeCampusId: string | null,
) {
  const campusIds = (await checkoutCampuses(actor, "checkout:read"))
    .map((c) => c.id)
    .filter((id) => !activeCampusId || id === activeCampusId);
  if (campusIds.length === 0) return [];
  const view = params.view ?? "upcoming";
  const today = todayDate();
  const groups = await db.guestGroup.findMany({
    where: {
      organizationId: actor.organizationId,
      campusId: { in: campusIds },
      ...(view === "archived"
        ? { archivedAt: { not: null } }
        : view === "past"
          ? { archivedAt: null, departureDate: { lt: today } }
          : { archivedAt: null, departureDate: { gte: today } }),
    },
    orderBy:
      view === "upcoming"
        ? [{ arrivalDate: "asc" }, { name: "asc" }]
        : [{ departureDate: "desc" }, { name: "asc" }],
    take: 200,
    select: {
      id: true,
      name: true,
      repName: true,
      arrivalDate: true,
      departureDate: true,
      archivedAt: true,
      campus: { select: { code: true } },
      staffContact: { select: { displayName: true } },
      portalLinks: {
        where: { revokedAt: null },
        take: 1,
        select: { revokedAt: true },
      },
    },
  });
  const day = dateInZone(new Date(), appTimeZone());
  return groups.map(({ portalLinks, ...group }) => ({
    ...group,
    linkStatus: portalLinks[0] ? portalLinkStatus(portalLinks[0], group, day) : null,
  }));
}

const guestGroupDetailSelect = {
  id: true,
  organizationId: true,
  campusId: true,
  name: true,
  repName: true,
  repEmail: true,
  repPhone: true,
  arrivalDate: true,
  departureDate: true,
  staffContactId: true,
  notes: true,
  archivedAt: true,
  createdAt: true,
  campus: { select: { code: true, name: true } },
  staffContact: { select: { displayName: true } },
  portalLinks: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: {
      id: true,
      sentTo: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true,
      createdBy: { select: { displayName: true } },
    },
  },
  checkouts: {
    orderBy: { number: "asc" },
    select: { id: true, number: true, status: true, dateOut: true, dateDue: true },
  },
} satisfies Prisma.GuestGroupSelect;

/** A guest group the actor may see, or null (also for other organizations). */
export async function getGuestGroup(actor: Actor, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const group = await db.guestGroup.findFirst({
    where: { id, organizationId: actor.organizationId },
    select: guestGroupDetailSelect,
  });
  if (!group || !can(actor, "checkout:read", checkoutScope(group))) return null;
  const { portalLinks, ...rest } = group;
  const latest = portalLinks[0] ?? null;
  const day = dateInZone(new Date(), appTimeZone());
  return {
    ...rest,
    link: latest ? { ...latest, status: portalLinkStatus(latest, group, day) } : null,
    linkLastDay: portalLinkLastDay(group.departureDate),
  };
}

export type GuestGroupDetail = NonNullable<Awaited<ReturnType<typeof getGuestGroup>>>;

/**
 * Makes a group's new portal link inside a transaction, revoking any link it
 * had. Returns the token, which exists only in memory from here on: show it
 * once or hand it (encrypted) to the email job. Never log it.
 */
export async function issuePortalLink(
  tx: Prisma.TransactionClient,
  group: { id: string; organizationId: string },
  options: { actorId: string; sentTo: string | null },
) {
  await tx.portalLink.updateMany({
    where: { guestGroupId: group.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const token = newPortalToken();
  const link = await tx.portalLink.create({
    data: {
      organizationId: group.organizationId,
      guestGroupId: group.id,
      tokenHash: hashPortalToken(token),
      sentTo: options.sentTo,
      createdById: options.actorId,
    },
    select: { id: true },
  });
  return { linkId: link.id, token };
}
