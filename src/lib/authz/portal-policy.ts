/**
 * Guest portal access policy. Pure functions only. A portal visitor is not a
 * user: it is one guest group, known from its portal link, and it never
 * holds grants, so the staff `can()` never applies to it. Everything the
 * portal reads or changes goes through `portalCan`.
 */

/** Days after the group's departure date that its portal link keeps working. */
export const PORTAL_LINK_DAYS_AFTER_DEPARTURE = 14;

export interface PortalPrincipal {
  kind: "portal";
  organizationId: string;
  campusId: string;
  guestGroupId: string;
  linkId: string;
}

/** What a portal visitor can do. Later steps add the catalog and requests. */
export const portalActions = ["portal:view"] as const;
export type PortalAction = (typeof portalActions)[number];

/** Something that belongs to one guest group. */
export interface PortalResource {
  organizationId: string;
  campusId: string;
  guestGroupId: string;
}

export function portalCan(
  principal: PortalPrincipal,
  action: PortalAction,
  resource: PortalResource,
): boolean {
  return (
    principal.kind === "portal" &&
    portalActions.includes(action) &&
    resource.organizationId === principal.organizationId &&
    resource.campusId === principal.campusId &&
    resource.guestGroupId === principal.guestGroupId
  );
}

export type PortalLinkStatus = "active" | "revoked" | "expired" | "archived";

/** The last day (YYYY-MM-DD) a group's link works: 14 days after it leaves. */
export function portalLinkLastDay(departureDate: Date): string {
  const last = new Date(departureDate.getTime());
  last.setUTCDate(last.getUTCDate() + PORTAL_LINK_DAYS_AFTER_DEPARTURE);
  return last.toISOString().slice(0, 10);
}

/**
 * Whether a link works today (YYYY-MM-DD in the organization's time zone).
 * A link works through the whole of its last day.
 */
export function portalLinkStatus(
  link: { revokedAt: Date | null },
  group: { archivedAt: Date | null; departureDate: Date },
  today: string,
): PortalLinkStatus {
  if (group.archivedAt) return "archived";
  if (link.revokedAt) return "revoked";
  if (today > portalLinkLastDay(group.departureDate)) return "expired";
  return "active";
}
