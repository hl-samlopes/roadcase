import "server-only";
import { db } from "@/lib/db";
import { computeAccessibleCampusIds, type Actor } from "./policy";

export async function accessibleCampuses(actor: Actor) {
  if (!actor.isActive || actor.grants.length === 0) return [];
  const locationIds = actor.grants.flatMap((g) => (g.locationId ? [g.locationId] : []));
  const departmentIds = actor.grants.flatMap((g) => (g.departmentId ? [g.departmentId] : []));

  const [campuses, locations, departmentLinks] = await Promise.all([
    db.campus.findMany({
      where: { organizationId: actor.organizationId, archivedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    locationIds.length
      ? db.location.findMany({
          where: { id: { in: locationIds } },
          select: { id: true, campusId: true },
        })
      : [],
    departmentIds.length
      ? db.departmentLocation.findMany({
          where: { departmentId: { in: departmentIds } },
          select: { departmentId: true, location: { select: { campusId: true } } },
        })
      : [],
  ]);

  const departmentCampuses = new Map<string, string[]>();
  for (const link of departmentLinks) {
    const list = departmentCampuses.get(link.departmentId) ?? [];
    list.push(link.location.campusId);
    departmentCampuses.set(link.departmentId, list);
  }

  const ids = new Set(
    computeAccessibleCampusIds(actor.grants, {
      allCampusIds: campuses.map((c) => c.id),
      locationCampus: new Map(locations.map((l) => [l.id, l.campusId])),
      departmentCampuses,
    }),
  );
  return campuses.filter((campus) => ids.has(campus.id));
}
