import { describe, expect, it } from "vitest";
import type { Grant } from "@/lib/authz/policy";
import {
  emailPreferencesOf,
  isTicketRecipient,
  type NoticeCandidate,
  type NoticeTicket,
} from "./recipients";

const ORG = "org-1";
const HNE = "campus-hne";
const HLK = "campus-hlk";
const PRODUCTION = "dept-production";
const FOOD = "dept-food";

const ticket: NoticeTicket = {
  organizationId: ORG,
  campusId: HNE,
  locationId: "loc-hne-main",
  departmentId: PRODUCTION,
  reporterId: "reporter",
  assigneeType: null,
  assigneeUserId: null,
  assigneeDepartmentId: null,
};

function grant(partial: Partial<Grant> & Pick<Grant, "level" | "scopeType">): Grant {
  return {
    campusId: null,
    locationId: null,
    departmentId: null,
    canSubmitTickets: false,
    ...partial,
  };
}

function person(id: string, grants: Grant[], overrides: Partial<NoticeCandidate> = {}) {
  return {
    id,
    organizationId: ORG,
    isActive: true,
    grants,
    emailPreferences: emailPreferencesOf(null),
    ...overrides,
  } satisfies NoticeCandidate;
}

const hneEditor = person("hne-editor", [
  grant({ level: "EDITOR", scopeType: "CAMPUS", campusId: HNE }),
]);
const hneViewer = person("hne-viewer", [
  grant({ level: "VIEWER", scopeType: "CAMPUS", campusId: HNE }),
]);
const hlkEditor = person("hlk-editor", [
  grant({ level: "EDITOR", scopeType: "CAMPUS", campusId: HLK }),
]);
const orgAdmin = person("org-admin", [grant({ level: "ADMIN", scopeType: "ORGANIZATION" })]);
const foodEditor = person("food-editor", [
  grant({ level: "EDITOR", scopeType: "DEPARTMENT", departmentId: FOOD }),
]);

describe("isTicketRecipient", () => {
  it("emails editors over the ticket's scope when it opens, but not the person who opened it", () => {
    expect(isTicketRecipient("opened", ticket, "reporter", hneEditor)).toBe(true);
    expect(isTicketRecipient("opened", ticket, "reporter", orgAdmin)).toBe(true);
    expect(isTicketRecipient("opened", ticket, "reporter", hneViewer)).toBe(false);
    expect(isTicketRecipient("opened", ticket, "reporter", hlkEditor)).toBe(false);
    expect(isTicketRecipient("opened", ticket, "hne-editor", hneEditor)).toBe(false);
  });

  it("emails the assigned person only if they can still see the ticket", () => {
    const assigned = { ...ticket, assigneeType: "USER" as const, assigneeUserId: "hne-viewer" };
    expect(isTicketRecipient("assigned", assigned, "org-admin", hneViewer)).toBe(true);
    expect(isTicketRecipient("assigned", assigned, "org-admin", hneEditor)).toBe(false);
    const movedAway = person("hne-viewer", [
      grant({ level: "VIEWER", scopeType: "CAMPUS", campusId: HLK }),
    ]);
    expect(isTicketRecipient("assigned", assigned, "org-admin", movedAway)).toBe(false);
  });

  it("emails editors of an assigned department who can see the ticket", () => {
    const toFood = { ...ticket, assigneeType: "DEPARTMENT" as const, assigneeDepartmentId: FOOD };
    // Food's editor can't see a Production ticket at HNE, so stays out.
    expect(isTicketRecipient("assigned", toFood, "org-admin", foodEditor)).toBe(false);
    const foodAtHne = person("food-hne", [
      grant({ level: "EDITOR", scopeType: "DEPARTMENT", departmentId: FOOD }),
      grant({ level: "VIEWER", scopeType: "CAMPUS", campusId: HNE }),
    ]);
    expect(isTicketRecipient("assigned", toFood, "org-admin", foodAtHne)).toBe(true);
    // Organization-wide editors aren't emailed for every department assignment.
    expect(isTicketRecipient("assigned", toFood, "hne-editor", orgAdmin)).toBe(false);
  });

  it("emails the reporter when it's completed, and reporter and assignee on comments", () => {
    const reporter = person("reporter", [
      grant({ level: "COMMENTER", scopeType: "CAMPUS", campusId: HNE }),
    ]);
    const withAssignee = { ...ticket, assigneeType: "USER" as const, assigneeUserId: "hne-editor" };
    expect(isTicketRecipient("completed", withAssignee, "hne-editor", reporter)).toBe(true);
    expect(isTicketRecipient("completed", withAssignee, "reporter", hneEditor)).toBe(false);
    expect(isTicketRecipient("comment", withAssignee, "hne-editor", reporter)).toBe(true);
    expect(isTicketRecipient("comment", withAssignee, "reporter", hneEditor)).toBe(true);
    expect(isTicketRecipient("comment", withAssignee, "reporter", reporter)).toBe(false);
    expect(isTicketRecipient("comment", withAssignee, "reporter", orgAdmin)).toBe(false);
  });

  it("respects opt-outs and inactive accounts", () => {
    const optedOut = {
      ...hneEditor,
      emailPreferences: { ...emailPreferencesOf(null), opened: false },
    };
    expect(isTicketRecipient("opened", ticket, "reporter", optedOut)).toBe(false);
    expect(isTicketRecipient("opened", ticket, "reporter", { ...hneEditor, isActive: false })).toBe(
      false,
    );
    expect(
      isTicketRecipient("opened", ticket, "reporter", { ...hneEditor, organizationId: "org-2" }),
    ).toBe(false);
  });
});
