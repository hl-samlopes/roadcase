import "server-only";
import { can, type Actor } from "@/lib/authz/policy";
import { db } from "@/lib/db";

/**
 * Campuses and departments whose Slack webhook this admin may manage: an
 * admin grant over the campus or the department (organization admins get all).
 */
export async function slackScopes(actor: Actor) {
  const [campuses, departments] = await Promise.all([
    db.campus.findMany({
      where: { organizationId: actor.organizationId, archivedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    db.department.findMany({
      where: { organizationId: actor.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const organizationId = actor.organizationId;
  return {
    campuses: campuses.filter((c) =>
      can(actor, "settings:manage", { organizationId, campusId: c.id }),
    ),
    departments: departments.filter((d) =>
      can(actor, "settings:manage", { organizationId, departmentId: d.id }),
    ),
  };
}

export type SlackScopes = Awaited<ReturnType<typeof slackScopes>>;

/** Webhooks in the admin's scopes, newest first. The encrypted URL is never selected. */
export function manageableWebhooks(actor: Actor, scopes: SlackScopes) {
  return db.slackWebhook.findMany({
    where: {
      organizationId: actor.organizationId,
      OR: [
        { campusId: { in: scopes.campuses.map((c) => c.id) } },
        { departmentId: { in: scopes.departments.map((d) => d.id) } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      urlHint: true,
      createdAt: true,
      campus: { select: { code: true, name: true } },
      department: { select: { name: true } },
    },
  });
}
