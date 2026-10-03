import { describe, expect, it } from "vitest";
import { computeAccessibleCampusIds, type Grant } from "./policy";

const lookup = {
  allCampusIds: ["hlk", "hne", "hsc"],
  locationCampus: new Map([["meadow-ranch", "hlk"]]),
  departmentCampuses: new Map([["food", ["hne", "hlk"]]]),
};

const grant = (partial: Partial<Grant> & Pick<Grant, "scopeType">): Grant => ({
  level: "VIEWER",
  campusId: null,
  locationId: null,
  departmentId: null,
  canSubmitTickets: false,
  ...partial,
});

describe("computeAccessibleCampusIds", () => {
  it("offers every campus for organization-wide access", () => {
    expect(computeAccessibleCampusIds([grant({ scopeType: "ORGANIZATION" })], lookup)).toEqual([
      "hlk",
      "hne",
      "hsc",
    ]);
  });

  it("maps campus, location and department grants to campuses in campus order", () => {
    expect(
      computeAccessibleCampusIds(
        [
          grant({ scopeType: "DEPARTMENT", departmentId: "food" }),
          grant({ scopeType: "LOCATION", locationId: "meadow-ranch" }),
        ],
        lookup,
      ),
    ).toEqual(["hlk", "hne"]);
    expect(
      computeAccessibleCampusIds([grant({ scopeType: "CAMPUS", campusId: "hsc" })], lookup),
    ).toEqual(["hsc"]);
  });

  it("offers nothing without grants or for unknown scopes", () => {
    expect(computeAccessibleCampusIds([], lookup)).toEqual([]);
    expect(
      computeAccessibleCampusIds([grant({ scopeType: "LOCATION", locationId: "gone" })], lookup),
    ).toEqual([]);
  });
});
