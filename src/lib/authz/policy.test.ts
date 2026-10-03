import { describe, expect, it } from "vitest";
import {
  can,
  canManageGrantScope,
  canManageUser,
  effectiveLevel,
  scopeWhere,
  type Actor,
  type Grant,
  type GrantScope,
  type ScopedResource,
} from "./policy";

const ORG = "org-1";
const OTHER_ORG = "org-2";
const HLK = "campus-hlk";
const HNE = "campus-hne";
const MEADOW_RANCH = "loc-meadow-ranch"; // at HLK
const HLK_MAIN = "loc-hlk-main"; // at HLK
const HNE_MAIN = "loc-hne-main"; // at HNE
const PRODUCTION = "dept-production";
const FOOD_SERVICE = "dept-food-service";

function grant(partial: Partial<Grant> & Pick<Grant, "level" | "scopeType">): Grant {
  return {
    campusId: null,
    locationId: null,
    departmentId: null,
    canSubmitTickets: false,
    ...partial,
  };
}

function actor(grants: Grant[], overrides: Partial<Actor> = {}): Actor {
  return { id: "user-1", organizationId: ORG, isActive: true, grants, ...overrides };
}

function item(campusId: string, locationId: string, departmentId: string): ScopedResource {
  return { organizationId: ORG, campusId, locationId, departmentId };
}

const meadowRanchMixer = item(HLK, MEADOW_RANCH, PRODUCTION);
const hlkMainSpeaker = item(HLK, HLK_MAIN, PRODUCTION);
const hneMainMic = item(HNE, HNE_MAIN, PRODUCTION);
const hlkKitchenFridge = item(HLK, HLK_MAIN, FOOD_SERVICE);
const hneKitchenOven = item(HNE, HNE_MAIN, FOOD_SERVICE);

describe("scope resolution", () => {
  it("organization-wide grants cover every campus, location and department", () => {
    const admin = actor([grant({ level: "ADMIN", scopeType: "ORGANIZATION" })]);
    for (const resource of [meadowRanchMixer, hneMainMic, hneKitchenOven]) {
      expect(effectiveLevel(admin, resource)).toBe("ADMIN");
    }
  });

  it("campus grants cover only that campus", () => {
    const user = actor([grant({ level: "EDITOR", scopeType: "CAMPUS", campusId: HLK })]);
    expect(effectiveLevel(user, meadowRanchMixer)).toBe("EDITOR");
    expect(effectiveLevel(user, hlkKitchenFridge)).toBe("EDITOR");
    expect(effectiveLevel(user, hneMainMic)).toBeNull();
  });

  it("takes the highest level across overlapping grants", () => {
    const user = actor([
      grant({ level: "VIEWER", scopeType: "CAMPUS", campusId: HLK }),
      grant({ level: "EDITOR", scopeType: "LOCATION", locationId: MEADOW_RANCH }),
      grant({ level: "COMMENTER", scopeType: "DEPARTMENT", departmentId: PRODUCTION }),
    ]);
    expect(effectiveLevel(user, meadowRanchMixer)).toBe("EDITOR");
    expect(effectiveLevel(user, hlkMainSpeaker)).toBe("COMMENTER");
    expect(effectiveLevel(user, hlkKitchenFridge)).toBe("VIEWER");
    expect(effectiveLevel(user, hneMainMic)).toBe("COMMENTER");
    expect(effectiveLevel(user, hneKitchenOven)).toBeNull();
  });

  it("never crosses organizations", () => {
    const admin = actor([grant({ level: "ADMIN", scopeType: "ORGANIZATION" })]);
    expect(can(admin, "item:read", { ...meadowRanchMixer, organizationId: OTHER_ORG })).toBe(false);
  });

  it("gives deactivated users no access", () => {
    const admin = actor([grant({ level: "ADMIN", scopeType: "ORGANIZATION" })], {
      isActive: false,
    });
    expect(can(admin, "item:read", meadowRanchMixer)).toBe(false);
    expect(scopeWhere(admin, "item:read")).toBeNull();
  });

  it("gives users without grants no access", () => {
    const user = actor([]);
    expect(can(user, "item:read", meadowRanchMixer)).toBe(false);
    expect(scopeWhere(user, "item:read")).toBeNull();
  });

  it("applies the level ladder to actions", () => {
    const at = (level: Grant["level"]) => actor([grant({ level, scopeType: "ORGANIZATION" })]);
    expect(can(at("VIEWER"), "item:read", hneMainMic)).toBe(true);
    expect(can(at("VIEWER"), "item:comment", hneMainMic)).toBe(false);
    expect(can(at("COMMENTER"), "item:comment", hneMainMic)).toBe(true);
    expect(can(at("COMMENTER"), "ticket:submit", hneMainMic)).toBe(true);
    expect(can(at("COMMENTER"), "item:update", hneMainMic)).toBe(false);
    expect(can(at("EDITOR"), "item:update", hneMainMic)).toBe(true);
    expect(can(at("EDITOR"), "fields:manage", hneMainMic)).toBe(false);
    expect(can(at("ADMIN"), "fields:manage", hneMainMic)).toBe(true);
  });
});

describe("scenario: summer staffer, editor at Meadow Ranch only", () => {
  const staffer = actor([
    grant({ level: "EDITOR", scopeType: "LOCATION", locationId: MEADOW_RANCH }),
  ]);

  it("can view, edit and ticket Meadow Ranch equipment", () => {
    for (const action of [
      "item:read",
      "item:update",
      "item:create",
      "ticket:submit",
      "ticket:manage",
    ] as const) {
      expect(can(staffer, action, meadowRanchMixer)).toBe(true);
    }
  });

  it("cannot see or edit other locations at the same campus", () => {
    expect(can(staffer, "item:read", hlkMainSpeaker)).toBe(false);
    expect(can(staffer, "item:update", hlkMainSpeaker)).toBe(false);
  });

  it("cannot see another campus", () => {
    expect(can(staffer, "item:read", hneMainMic)).toBe(false);
  });

  it("cannot administer anything", () => {
    expect(can(staffer, "fields:manage", meadowRanchMixer)).toBe(false);
    expect(canManageGrantScope(staffer, locationScope(MEADOW_RANCH, HLK))).toBe(false);
  });

  it("lists only Meadow Ranch records", () => {
    expect(scopeWhere(staffer, "item:read")).toEqual({
      organizationId: ORG,
      OR: [{ locationId: MEADOW_RANCH }],
    });
  });
});

describe("scenario: food service manager, viewer plus tickets across the department", () => {
  const manager = actor([
    grant({
      level: "VIEWER",
      scopeType: "DEPARTMENT",
      departmentId: FOOD_SERVICE,
      canSubmitTickets: true,
    }),
  ]);

  it("sees food service equipment at every campus", () => {
    expect(can(manager, "item:read", hlkKitchenFridge)).toBe(true);
    expect(can(manager, "item:read", hneKitchenOven)).toBe(true);
    expect(can(manager, "serviceLog:read", hneKitchenOven)).toBe(true);
  });

  it("can submit tickets for food service equipment", () => {
    expect(can(manager, "ticket:submit", hlkKitchenFridge)).toBe(true);
    expect(can(manager, "ticket:submit", hneKitchenOven)).toBe(true);
  });

  it("cannot comment, edit or manage tickets", () => {
    expect(can(manager, "ticket:comment", hneKitchenOven)).toBe(false);
    expect(can(manager, "item:update", hneKitchenOven)).toBe(false);
    expect(can(manager, "ticket:manage", hneKitchenOven)).toBe(false);
  });

  it("cannot see other departments' equipment, even in the same rooms", () => {
    expect(can(manager, "item:read", hlkMainSpeaker)).toBe(false);
    expect(can(manager, "ticket:submit", hneMainMic)).toBe(false);
  });

  it("lists food service records for reading and ticketing, nothing for editing", () => {
    const expected = { organizationId: ORG, OR: [{ departmentId: FOOD_SERVICE }] };
    expect(scopeWhere(manager, "item:read")).toEqual(expected);
    expect(scopeWhere(manager, "ticket:submit")).toEqual(expected);
    expect(scopeWhere(manager, "item:update")).toBeNull();
  });

  it("the ticket flag does not leak to viewers without it", () => {
    const viewer = actor([
      grant({ level: "VIEWER", scopeType: "DEPARTMENT", departmentId: FOOD_SERVICE }),
    ]);
    expect(can(viewer, "ticket:submit", hneKitchenOven)).toBe(false);
  });
});

describe("scopeWhere", () => {
  it("is unrestricted within the organization for organization-wide grants", () => {
    const user = actor([
      grant({ level: "VIEWER", scopeType: "LOCATION", locationId: MEADOW_RANCH }),
      grant({ level: "VIEWER", scopeType: "ORGANIZATION" }),
    ]);
    expect(scopeWhere(user, "item:read")).toEqual({ organizationId: ORG });
  });

  it("combines and de-duplicates scoped grants that allow the action", () => {
    const user = actor([
      grant({ level: "EDITOR", scopeType: "CAMPUS", campusId: HLK }),
      grant({ level: "VIEWER", scopeType: "CAMPUS", campusId: HLK }),
      grant({ level: "VIEWER", scopeType: "DEPARTMENT", departmentId: FOOD_SERVICE }),
    ]);
    expect(scopeWhere(user, "item:read")).toEqual({
      organizationId: ORG,
      OR: [{ campusId: HLK }, { departmentId: FOOD_SERVICE }],
    });
    expect(scopeWhere(user, "item:update")).toEqual({
      organizationId: ORG,
      OR: [{ campusId: HLK }],
    });
  });
});

function orgScope(): GrantScope {
  return { scopeType: "ORGANIZATION", campusId: null, locationId: null, departmentId: null };
}
function campusScope(campusId: string): GrantScope {
  return { scopeType: "CAMPUS", campusId, locationId: null, departmentId: null };
}
function locationScope(locationId: string, locationCampusId: string): GrantScope {
  return {
    scopeType: "LOCATION",
    campusId: null,
    locationId,
    departmentId: null,
    locationCampusId,
  };
}
function departmentScope(departmentId: string): GrantScope {
  return { scopeType: "DEPARTMENT", campusId: null, locationId: null, departmentId };
}

describe("grant and user administration", () => {
  const orgAdmin = actor([grant({ level: "ADMIN", scopeType: "ORGANIZATION" })]);
  const hlkAdmin = actor([grant({ level: "ADMIN", scopeType: "CAMPUS", campusId: HLK })]);
  const foodAdmin = actor([
    grant({ level: "ADMIN", scopeType: "DEPARTMENT", departmentId: FOOD_SERVICE }),
  ]);

  it("organization admins manage every scope", () => {
    for (const scope of [
      orgScope(),
      campusScope(HNE),
      locationScope(MEADOW_RANCH, HLK),
      departmentScope(PRODUCTION),
    ]) {
      expect(canManageGrantScope(orgAdmin, scope)).toBe(true);
    }
  });

  it("campus admins manage their campus and its locations only", () => {
    expect(canManageGrantScope(hlkAdmin, campusScope(HLK))).toBe(true);
    expect(canManageGrantScope(hlkAdmin, locationScope(MEADOW_RANCH, HLK))).toBe(true);
    expect(canManageGrantScope(hlkAdmin, locationScope(HNE_MAIN, HNE))).toBe(false);
    expect(canManageGrantScope(hlkAdmin, campusScope(HNE))).toBe(false);
    expect(canManageGrantScope(hlkAdmin, orgScope())).toBe(false);
    // Departments span campuses, so a campus admin cannot grant one.
    expect(canManageGrantScope(hlkAdmin, departmentScope(PRODUCTION))).toBe(false);
  });

  it("refuses a location scope whose campus is unknown", () => {
    expect(
      canManageGrantScope(hlkAdmin, {
        ...locationScope(MEADOW_RANCH, HLK),
        locationCampusId: null,
      }),
    ).toBe(false);
  });

  it("department admins manage their department only", () => {
    expect(canManageGrantScope(foodAdmin, departmentScope(FOOD_SERVICE))).toBe(true);
    expect(canManageGrantScope(foodAdmin, departmentScope(PRODUCTION))).toBe(false);
    expect(canManageGrantScope(foodAdmin, campusScope(HLK))).toBe(false);
  });

  it("admins manage accounts whose grants all fall inside their scope", () => {
    const mrStaffer = { organizationId: ORG, grants: [locationScope(MEADOW_RANCH, HLK)] };
    const crossCampus = {
      organizationId: ORG,
      grants: [locationScope(MEADOW_RANCH, HLK), campusScope(HNE)],
    };
    const noGrants = { organizationId: ORG, grants: [] };
    const otherOrg = { organizationId: OTHER_ORG, grants: [] };

    expect(canManageUser(hlkAdmin, mrStaffer)).toBe(true);
    expect(canManageUser(hlkAdmin, crossCampus)).toBe(false);
    expect(canManageUser(hlkAdmin, noGrants)).toBe(true);
    expect(canManageUser(orgAdmin, crossCampus)).toBe(true);
    expect(canManageUser(orgAdmin, otherOrg)).toBe(false);
    expect(canManageUser(hlkAdmin, { organizationId: ORG, grants: [orgScope()] })).toBe(false);
  });

  it("non-admins manage no accounts", () => {
    const editor = actor([grant({ level: "EDITOR", scopeType: "ORGANIZATION" })]);
    expect(canManageUser(editor, { organizationId: ORG, grants: [] })).toBe(false);
  });
});
