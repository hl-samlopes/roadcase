import { describe, expect, it } from "vitest";
import {
  portalCan,
  portalLinkLastDay,
  portalLinkStatus,
  type PortalPrincipal,
} from "./portal-policy";
import { hashPortalToken, isPortalTokenShape, newPortalToken } from "@/lib/portal/token";

const principal: PortalPrincipal = {
  kind: "portal",
  organizationId: "org-1",
  campusId: "campus-1",
  guestGroupId: "group-1",
  linkId: "link-1",
};
const own = { organizationId: "org-1", campusId: "campus-1", guestGroupId: "group-1" };

describe("portalCan", () => {
  it("lets a group see its own portal", () => {
    expect(portalCan(principal, "portal:view", own)).toBe(true);
  });

  it("never reaches another group, campus or organization", () => {
    expect(portalCan(principal, "portal:view", { ...own, guestGroupId: "group-2" })).toBe(false);
    expect(portalCan(principal, "portal:view", { ...own, campusId: "campus-2" })).toBe(false);
    expect(portalCan(principal, "portal:view", { ...own, organizationId: "org-2" })).toBe(false);
  });

  it("refuses actions it doesn't know, such as staff actions", () => {
    expect(portalCan(principal, "checkout:manage" as never, own)).toBe(false);
  });

  it("refuses anything that isn't a portal principal", () => {
    const user = { ...principal, kind: "user" } as unknown as PortalPrincipal;
    expect(portalCan(user, "portal:view", own)).toBe(false);
  });
});

describe("portal link status", () => {
  const departureDate = new Date("2026-10-12T00:00:00Z");
  const group = { archivedAt: null, departureDate };
  const link = { revokedAt: null };

  it("works through 14 days after departure, then expires", () => {
    expect(portalLinkLastDay(departureDate)).toBe("2026-10-26");
    expect(portalLinkStatus(link, group, "2026-10-01")).toBe("active");
    expect(portalLinkStatus(link, group, "2026-10-26")).toBe("active");
    expect(portalLinkStatus(link, group, "2026-10-27")).toBe("expired");
  });

  it("stops at once when revoked or when the group is archived", () => {
    expect(portalLinkStatus({ revokedAt: new Date() }, group, "2026-10-01")).toBe("revoked");
    expect(portalLinkStatus(link, { ...group, archivedAt: new Date() }, "2026-10-01")).toBe(
      "archived",
    );
  });
});

describe("portal tokens", () => {
  it("are 43 base64url characters, different every time", () => {
    const a = newPortalToken();
    expect(isPortalTokenShape(a)).toBe(true);
    expect(newPortalToken()).not.toBe(a);
  });

  it("are stored only as a SHA-256", () => {
    const token = newPortalToken();
    expect(hashPortalToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPortalToken(token)).not.toContain(token);
  });

  it("rejects anything shaped differently before a lookup", () => {
    expect(isPortalTokenShape("short")).toBe(false);
    expect(isPortalTokenShape(`${"a".repeat(42)}/`)).toBe(false);
    expect(isPortalTokenShape("a".repeat(44))).toBe(false);
  });
});
