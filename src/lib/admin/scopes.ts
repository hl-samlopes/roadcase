import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client.ts";
import { canManageGrantScope, type Actor, type GrantScope } from "@/lib/authz";
import { db } from "@/lib/db";
import { scopeTypeLabels } from "@/lib/labels";

export interface ScopeOption {
  value: string;
  label: string;
  group: string;
}

/** Scopes the actor may grant, as select options ("CAMPUS:<id>" and so on). */
export async function manageableScopeOptions(actor: Actor): Promise<ScopeOption[]> {
  const organizationId = actor.organizationId;
  const [campuses, locations, departments] = await Promise.all([
    db.campus.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    db.location.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: [{ campus: { code: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, campusId: true, campus: { select: { code: true } } },
    }),
    db.department.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const options: ScopeOption[] = [];
  const add = (scope: GrantScope, option: ScopeOption) => {
    if (canManageGrantScope(actor, scope)) options.push(option);
  };
  const none = { campusId: null, locationId: null, departmentId: null };

  add(
    { scopeType: "ORGANIZATION", ...none },
    { value: "ORGANIZATION", label: "Whole organization", group: scopeTypeLabels.ORGANIZATION },
  );
  for (const campus of campuses) {
    add(
      { scopeType: "CAMPUS", ...none, campusId: campus.id },
      {
        value: `CAMPUS:${campus.id}`,
        label: `${campus.name} (${campus.code})`,
        group: "Campuses",
      },
    );
  }
  for (const location of locations) {
    add(
      {
        scopeType: "LOCATION",
        ...none,
        locationId: location.id,
        locationCampusId: location.campusId,
      },
      {
        value: `LOCATION:${location.id}`,
        label: `${location.name} (${location.campus.code})`,
        group: "Locations",
      },
    );
  }
  for (const department of departments) {
    add(
      { scopeType: "DEPARTMENT", ...none, departmentId: department.id },
      { value: `DEPARTMENT:${department.id}`, label: department.name, group: "Departments" },
    );
  }
  return options;
}

const scopeValueSchema = z.union([
  z.literal("ORGANIZATION"),
  z.templateLiteral([z.enum(["CAMPUS", "LOCATION", "DEPARTMENT"]), ":", z.uuid()]),
]);

/**
 * Turns a submitted scope value into a grant scope inside the actor's
 * organization, or null if it is malformed or names something elsewhere.
 * Callers still check canManageGrantScope.
 */
export async function parseScopeValue(
  organizationId: string,
  value: unknown,
): Promise<GrantScope | null> {
  const parsed = scopeValueSchema.safeParse(value);
  if (!parsed.success) return null;
  const none = { campusId: null, locationId: null, departmentId: null };
  if (parsed.data === "ORGANIZATION") return { scopeType: "ORGANIZATION", ...none };

  const [type, id] = parsed.data.split(":") as ["CAMPUS" | "LOCATION" | "DEPARTMENT", string];
  switch (type) {
    case "CAMPUS": {
      const campus = await db.campus.findFirst({ where: { id, organizationId } });
      return campus ? { scopeType: "CAMPUS", ...none, campusId: campus.id } : null;
    }
    case "LOCATION": {
      const location = await db.location.findFirst({ where: { id, organizationId } });
      return location
        ? {
            scopeType: "LOCATION",
            ...none,
            locationId: location.id,
            locationCampusId: location.campusId,
          }
        : null;
    }
    case "DEPARTMENT": {
      const department = await db.department.findFirst({ where: { id, organizationId } });
      return department ? { scopeType: "DEPARTMENT", ...none, departmentId: department.id } : null;
    }
  }
}

/** Grant fields to select so a grant can be checked and described. */
export const grantDetailSelect = {
  id: true,
  level: true,
  scopeType: true,
  campusId: true,
  locationId: true,
  departmentId: true,
  canSubmitTickets: true,
  campus: { select: { code: true, name: true } },
  location: { select: { name: true, campusId: true, campus: { select: { code: true } } } },
  department: { select: { name: true } },
} as const satisfies Prisma.PermissionGrantSelect;

type GrantDetail = Prisma.PermissionGrantGetPayload<{ select: typeof grantDetailSelect }>;

export function toGrantScope(grant: GrantDetail): GrantScope {
  return {
    scopeType: grant.scopeType,
    campusId: grant.campusId,
    locationId: grant.locationId,
    departmentId: grant.departmentId,
    locationCampusId: grant.location?.campusId ?? null,
  };
}

export function describeScope(grant: GrantDetail): string {
  switch (grant.scopeType) {
    case "ORGANIZATION":
      return "Whole organization";
    case "CAMPUS":
      return grant.campus ? `${grant.campus.name} (${grant.campus.code})` : "Campus";
    case "LOCATION":
      return grant.location ? `${grant.location.name} (${grant.location.campus.code})` : "Location";
    case "DEPARTMENT":
      return grant.department ? `${grant.department.name} department` : "Department";
  }
}
