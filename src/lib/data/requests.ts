import "server-only";
import { z } from "zod";
import type { EquipmentRequestStatus } from "@/generated/prisma/enums.ts";
import { can, checkoutScope, type Actor } from "@/lib/authz/policy";
import { checkoutCampuses } from "@/lib/data/checkouts";
import { requestLineAvailability } from "@/lib/data/portal";
import { db } from "@/lib/db";
import { kindId } from "@/lib/portal/catalog";
import { decidedStatuses, waitingStatuses } from "@/lib/portal/requests";

/**
 * Equipment requests for staff. Like guest groups, they're campus-level:
 * seeing them needs `checkout:read` at the campus and reviewing them
 * `checkout:manage`. Drafts are the group's own until sent, so staff never
 * see their contents.
 */

export const requestListParamsSchema = z.object({
  view: z.enum(["waiting", "decided", "all"]).optional().catch(undefined),
});

const viewStatuses: Record<"waiting" | "decided" | "all", EquipmentRequestStatus[]> = {
  waiting: waitingStatuses,
  decided: decidedStatuses,
  all: [...waitingStatuses, ...decidedStatuses, "WITHDRAWN"],
};

export async function listRequests(
  actor: Actor,
  params: z.infer<typeof requestListParamsSchema>,
  activeCampusId: string | null,
) {
  const campusIds = (await checkoutCampuses(actor, "checkout:read"))
    .map((c) => c.id)
    .filter((id) => !activeCampusId || id === activeCampusId);
  if (campusIds.length === 0) return [];
  const view = params.view ?? "waiting";
  return db.equipmentRequest.findMany({
    where: {
      organizationId: actor.organizationId,
      campusId: { in: campusIds },
      status: { in: viewStatuses[view] },
      guestGroup: { archivedAt: null },
    },
    orderBy:
      view === "waiting"
        ? [{ guestGroup: { arrivalDate: "asc" } }, { submittedAt: "asc" }]
        : [{ submittedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      status: true,
      submittedAt: true,
      checkoutId: true,
      guestGroup: {
        select: {
          id: true,
          name: true,
          arrivalDate: true,
          departureDate: true,
          campus: { select: { code: true } },
        },
      },
      lines: { select: { quantityRequested: true } },
    },
  });
}

/**
 * A group's sent request for staff to review, with how many of each kind
 * are free for the group's dates. Null when the actor can't see the group or
 * there's nothing sent to see.
 */
export async function getRequestForReview(actor: Actor, groupId: string) {
  if (!z.uuid().safeParse(groupId).success) return null;
  const group = await db.guestGroup.findFirst({
    where: { id: groupId, organizationId: actor.organizationId },
    select: {
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
      archivedAt: true,
      campus: { select: { code: true, name: true } },
      request: {
        select: {
          id: true,
          status: true,
          note: true,
          submittedAt: true,
          staffMessage: true,
          decidedAt: true,
          decidedBy: { select: { displayName: true } },
          checkoutId: true,
          checkout: { select: { id: true, number: true, status: true } },
          lines: {
            orderBy: { name: "asc" },
            select: {
              id: true,
              categoryId: true,
              kindKey: true,
              name: true,
              quantityRequested: true,
              quantityApproved: true,
              staffNote: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!group || !can(actor, "checkout:read", checkoutScope(group))) return null;
  const { request, ...rest } = group;
  if (!request || request.status === "DRAFT") return { group: rest, request: null };
  const free = await requestLineAvailability(
    { organizationId: group.organizationId, campusId: group.campusId, guestGroupId: group.id },
    group,
    request.lines,
  );
  return {
    group: rest,
    request: {
      ...request,
      lines: request.lines.map((line) => ({
        ...line,
        free: free.get(kindId(line.categoryId, line.kindKey)) ?? 0,
      })),
    },
  };
}

export type RequestForReview = NonNullable<Awaited<ReturnType<typeof getRequestForReview>>>;
