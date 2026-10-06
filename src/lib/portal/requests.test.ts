import { describe, expect, it } from "vitest";
import { decisionStatus, guestCanEdit, isRequestApprover } from "./requests";

describe("decisionStatus", () => {
  it("is Approved when every line gets what was asked (or more)", () => {
    expect(
      decisionStatus([
        { quantityRequested: 2, quantityApproved: 2 },
        { quantityRequested: 1, quantityApproved: 3 },
      ]),
    ).toBe("APPROVED");
  });

  it("is Declined when nothing is approved", () => {
    expect(decisionStatus([{ quantityRequested: 2, quantityApproved: 0 }])).toBe("DECLINED");
  });

  it("is Partly approved otherwise", () => {
    expect(
      decisionStatus([
        { quantityRequested: 4, quantityApproved: 3 },
        { quantityRequested: 1, quantityApproved: 1 },
      ]),
    ).toBe("PARTLY_APPROVED");
    expect(
      decisionStatus([
        { quantityRequested: 1, quantityApproved: 0 },
        { quantityRequested: 1, quantityApproved: 1 },
      ]),
    ).toBe("PARTLY_APPROVED");
  });
});

describe("guestCanEdit", () => {
  it("stops once staff start reviewing", () => {
    expect(guestCanEdit(null)).toBe(true);
    expect(guestCanEdit("SUBMITTED")).toBe(true);
    expect(guestCanEdit("WITHDRAWN")).toBe(true);
    expect(guestCanEdit("IN_REVIEW")).toBe(false);
    expect(guestCanEdit("APPROVED")).toBe(false);
  });
});

describe("isRequestApprover", () => {
  const request = { organizationId: "org", campusId: "hne" };
  const editor = (grant: object, extra: object = {}) => ({
    id: "u1",
    organizationId: "org",
    isActive: true,
    emailRequestSent: true,
    grants: [
      {
        level: "EDITOR" as const,
        scopeType: "CAMPUS" as const,
        campusId: "hne",
        locationId: null,
        departmentId: null,
        canSubmitTickets: false,
        ...grant,
      },
    ],
    ...extra,
  });

  it("emails people who run check-outs at the campus", () => {
    expect(isRequestApprover(editor({}), request)).toBe(true);
  });

  it("skips other campuses, narrower grants, viewers, opt-outs and inactive accounts", () => {
    expect(isRequestApprover(editor({ campusId: "hlk" }), request)).toBe(false);
    expect(
      isRequestApprover(
        editor({ scopeType: "LOCATION", campusId: null, locationId: "mr" }),
        request,
      ),
    ).toBe(false);
    expect(isRequestApprover(editor({ level: "VIEWER" }), request)).toBe(false);
    expect(isRequestApprover(editor({}, { emailRequestSent: false }), request)).toBe(false);
    expect(isRequestApprover(editor({}, { isActive: false }), request)).toBe(false);
  });
});
