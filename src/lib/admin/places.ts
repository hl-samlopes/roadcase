import "server-only";
import { can, type Actor } from "@/lib/authz";
import { db } from "@/lib/db";

/** Campuses whose locations the actor may manage (organization or campus admins). */
export async function manageableCampuses(actor: Actor) {
  const campuses = await db.campus.findMany({
    where: { organizationId: actor.organizationId, archivedAt: null },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  return campuses.filter((campus) =>
    can(actor, "locations:manage", { organizationId: actor.organizationId, campusId: campus.id }),
  );
}

export function canManageDepartments(actor: Actor) {
  return can(actor, "departments:manage", { organizationId: actor.organizationId });
}

/** Whether the actor may see the locations and departments settings at all. */
export async function canOpenPlacesSettings(actor: Actor) {
  return canManageDepartments(actor) || (await manageableCampuses(actor)).length > 0;
}
