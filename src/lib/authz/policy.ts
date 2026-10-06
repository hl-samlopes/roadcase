import "server-only";
import type { PermissionLevel, ScopeType } from "@/generated/prisma/enums.ts";

/**
 * Roadcase permission policy. Pure functions only: callers load the actor and
 * resource, and every server read or mutation goes through `can` (or
 * `scopeWhere` for lists). Nothing here trusts what the UI shows or hides.
 */

const levelRank: Record<PermissionLevel, number> = {
  VIEWER: 1,
  COMMENTER: 2,
  EDITOR: 3,
  ADMIN: 4,
};

export interface Grant {
  level: PermissionLevel;
  scopeType: ScopeType;
  campusId: string | null;
  locationId: string | null;
  departmentId: string | null;
  canSubmitTickets: boolean;
}

export interface Actor {
  id: string;
  organizationId: string;
  isActive: boolean;
  grants: Grant[];
}

/**
 * Where something sits in the hierarchy. Equipment records set every field; a
 * scope target (for example a location being granted) sets only the levels it
 * belongs to, so narrower grants do not cover broader targets.
 */
export interface ScopedResource {
  organizationId: string;
  campusId?: string | null;
  locationId?: string | null;
  departmentId?: string | null;
}

export const actionLevels = {
  "item:read": "VIEWER",
  "item:comment": "COMMENTER",
  "item:create": "EDITOR",
  "item:update": "EDITOR",
  "item:delete": "EDITOR",
  "ticket:read": "VIEWER",
  "ticket:submit": "COMMENTER",
  "ticket:comment": "COMMENTER",
  "ticket:manage": "EDITOR",
  "serviceLog:read": "VIEWER",
  "serviceLog:manage": "EDITOR",
  "checkout:read": "VIEWER",
  "checkout:manage": "EDITOR",
  "checkout:audit": "ADMIN",
  "fields:manage": "ADMIN",
  "conditions:manage": "ADMIN",
  "categories:manage": "ADMIN",
  "locations:manage": "ADMIN",
  "departments:manage": "ADMIN",
  "users:manage": "ADMIN",
  "grants:manage": "ADMIN",
  "settings:manage": "ADMIN",
  "contracts:manage": "ADMIN",
} as const satisfies Record<string, PermissionLevel>;

export type Action = keyof typeof actionLevels;

/** Whether a grant's scope contains the resource (organization already matched). */
function grantCovers(grant: Grant, resource: ScopedResource): boolean {
  switch (grant.scopeType) {
    case "ORGANIZATION":
      return true;
    case "CAMPUS":
      return grant.campusId !== null && resource.campusId === grant.campusId;
    case "LOCATION":
      return grant.locationId !== null && resource.locationId === grant.locationId;
    case "DEPARTMENT":
      return grant.departmentId !== null && resource.departmentId === grant.departmentId;
  }
}

function grantAllows(grant: Grant, action: Action): boolean {
  if (levelRank[grant.level] >= levelRank[actionLevels[action]]) return true;
  return action === "ticket:submit" && grant.canSubmitTickets;
}

function applicableGrants(actor: Actor, resource: ScopedResource): Grant[] {
  if (!actor.isActive || actor.organizationId !== resource.organizationId) return [];
  return actor.grants.filter((grant) => grantCovers(grant, resource));
}

/** The highest level the actor holds over the resource, or null for none. */
export function effectiveLevel(actor: Actor, resource: ScopedResource): PermissionLevel | null {
  let best: PermissionLevel | null = null;
  for (const grant of applicableGrants(actor, resource)) {
    if (best === null || levelRank[grant.level] > levelRank[best]) best = grant.level;
  }
  return best;
}

export function can(actor: Actor, action: Action, resource: ScopedResource): boolean {
  return applicableGrants(actor, resource).some((grant) => grantAllows(grant, action));
}

export type ScopeCondition =
  { campusId: string } | { locationId: string } | { departmentId: string };

/**
 * Prisma `where` fragment selecting the equipment records (items, tickets,
 * service logs) on which the actor may perform `action`. Returns null when the
 * actor has no access at all, so callers can skip the query.
 */
export function scopeWhere(
  actor: Actor,
  action: Action,
): { organizationId: string; OR?: ScopeCondition[] } | null {
  if (!actor.isActive) return null;
  const conditions = new Map<string, ScopeCondition>();
  for (const grant of actor.grants) {
    if (!grantAllows(grant, action)) continue;
    switch (grant.scopeType) {
      case "ORGANIZATION":
        return { organizationId: actor.organizationId };
      case "CAMPUS":
        if (grant.campusId) conditions.set(`c:${grant.campusId}`, { campusId: grant.campusId });
        break;
      case "LOCATION":
        if (grant.locationId)
          conditions.set(`l:${grant.locationId}`, { locationId: grant.locationId });
        break;
      case "DEPARTMENT":
        if (grant.departmentId)
          conditions.set(`d:${grant.departmentId}`, { departmentId: grant.departmentId });
        break;
    }
  }
  if (conditions.size === 0) return null;
  return { organizationId: actor.organizationId, OR: [...conditions.values()] };
}

/** A grant's scope, with the campus of a location scope so campus admins cover it. */
export interface GrantScope {
  scopeType: ScopeType;
  campusId: string | null;
  locationId: string | null;
  departmentId: string | null;
  /** Campus of `locationId`, required for LOCATION scopes. */
  locationCampusId?: string | null;
}

export function grantScopeResource(organizationId: string, scope: GrantScope): ScopedResource {
  switch (scope.scopeType) {
    case "ORGANIZATION":
      return { organizationId };
    case "CAMPUS":
      return { organizationId, campusId: scope.campusId };
    case "LOCATION":
      return {
        organizationId,
        campusId: scope.locationCampusId ?? null,
        locationId: scope.locationId,
      };
    case "DEPARTMENT":
      return { organizationId, departmentId: scope.departmentId };
  }
}

/** Admins may create, change or remove grants only inside scopes they administer. */
export function canManageGrantScope(actor: Actor, scope: GrantScope): boolean {
  return can(actor, "grants:manage", grantScopeResource(actor.organizationId, scope));
}

/** Any admin, at any scope, may open user administration and create accounts. */
export function isAnyAdmin(actor: Actor): boolean {
  return actor.isActive && actor.grants.some((grant) => grant.level === "ADMIN");
}

/**
 * An admin may edit, reset or deactivate another account only when every grant
 * that account holds lies within the admin's own scope. Accounts without grants
 * can be managed by any admin.
 */
export function canManageUser(
  actor: Actor,
  target: { organizationId: string; grants: GrantScope[] },
): boolean {
  if (!isAnyAdmin(actor) || target.organizationId !== actor.organizationId) return false;
  return target.grants.every((grant) => canManageGrantScope(actor, grant));
}

/**
 * Campuses where the actor can see at least some equipment, for the campus
 * switcher. Data access is still filtered by scopeWhere; this only decides
 * which campuses are offered.
 */
export function computeAccessibleCampusIds(
  grants: Grant[],
  lookup: {
    allCampusIds: string[];
    locationCampus: Map<string, string>;
    departmentCampuses: Map<string, string[]>;
  },
): string[] {
  const ids = new Set<string>();
  for (const grant of grants) {
    switch (grant.scopeType) {
      case "ORGANIZATION":
        return [...lookup.allCampusIds];
      case "CAMPUS":
        if (grant.campusId) ids.add(grant.campusId);
        break;
      case "LOCATION": {
        const campusId = grant.locationId ? lookup.locationCampus.get(grant.locationId) : undefined;
        if (campusId) ids.add(campusId);
        break;
      }
      case "DEPARTMENT":
        for (const campusId of lookup.departmentCampuses.get(grant.departmentId ?? "") ?? []) {
          ids.add(campusId);
        }
        break;
    }
  }
  return lookup.allCampusIds.filter((id) => ids.has(id));
}

/** Ticket statuses after which a ticket is closed. */
export const closedTicketStatuses = ["COMPLETED", "CANCELLED"] as const;

export function isTicketClosed(status: string): boolean {
  return (closedTicketStatuses as readonly string[]).includes(status);
}

/**
 * Commenters and above may comment on tickets they can see. Someone who may
 * only submit tickets (a viewer with ticket submission) may still comment on
 * tickets they reported, so they can answer questions about them.
 */
export function canCommentOnTicket(
  actor: Actor,
  ticket: ScopedResource & { reporterId: string | null },
): boolean {
  return (
    can(actor, "ticket:comment", ticket) ||
    (ticket.reporterId === actor.id && can(actor, "ticket:submit", ticket))
  );
}

/**
 * A check-out is a campus-level resource: organization and campus grants
 * cover it, while location and department grants (narrower than a campus)
 * don't, so running check-outs needs editor access to the whole campus.
 */
export function checkoutScope(checkout: {
  organizationId: string;
  campusId: string;
}): ScopedResource {
  return { organizationId: checkout.organizationId, campusId: checkout.campusId };
}

export function canManageCheckout(
  actor: Actor,
  checkout: { organizationId: string; campusId: string },
): boolean {
  return can(actor, "checkout:manage", checkoutScope(checkout));
}

/**
 * Whether the actor may put this item on this check-out: they manage the
 * check-out, can see the item, and the item belongs to the check-out's campus.
 * (Availability, such as condition or another check-out, is checked separately.)
 */
export function canAddItemToCheckout(
  actor: Actor,
  checkout: { organizationId: string; campusId: string },
  item: ScopedResource,
): boolean {
  return (
    canManageCheckout(actor, checkout) &&
    can(actor, "item:read", item) &&
    item.organizationId === checkout.organizationId &&
    item.campusId === checkout.campusId
  );
}

/** Campuses (of those given) where the actor may perform a check-out action. */
export function checkoutCampusIds(
  actor: Actor,
  action: "checkout:read" | "checkout:manage",
  campusIds: string[],
): string[] {
  return campusIds.filter((campusId) =>
    can(actor, action, { organizationId: actor.organizationId, campusId }),
  );
}
