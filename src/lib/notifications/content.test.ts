import { describe, expect, it } from "vitest";
import { ticketEmailContent, ticketSlackContent, type ContentTicket } from "./content";

const ticket: ContentTicket = {
  number: 12,
  title: "Monitor wedge buzzes",
  description: "Buzz on channel 4 when the lights are up.",
  assigneeType: null,
  vendorName: null,
  assigneeUser: null,
  assigneeDepartment: null,
  item: { code: "HNE-000012", name: "Wedge monitor" },
  location: { name: "Main Hall" },
  campus: { code: "HNE" },
};
const url = "https://roadcase.example.com/tickets/abc";

describe("ticketEmailContent", () => {
  it("describes a new ticket with the item, place, details and a link", () => {
    const content = ticketEmailContent(
      "opened",
      ticket,
      { body: null, actor: { displayName: "Pat" } },
      url,
    );
    expect(content.subject).toBe("#12 opened: Monitor wedge buzzes");
    expect(content.paragraphs[0]).toBe(
      "Pat reported a problem with HNE-000012 Wedge monitor at Main Hall (HNE).",
    );
    expect(content.paragraphs[1]).toContain("Buzz on channel 4");
    expect(content.action).toEqual({ label: "Open ticket #12", url });
    expect(content.footer).toContain("turn these emails off in Preferences");
  });

  it("names the assignee and quotes comments, capped in length", () => {
    const assigned = {
      ...ticket,
      assigneeType: "USER",
      assigneeUser: { displayName: "Jordan" },
    };
    expect(ticketEmailContent("assigned", assigned, { body: null, actor: null }, url).subject).toBe(
      "#12 assigned to Jordan: Monitor wedge buzzes",
    );

    const long = "x".repeat(5000);
    const comment = ticketEmailContent("comment", ticket, { body: long, actor: null }, url);
    expect(comment.subject).toBe("New comment on #12: Monitor wedge buzzes");
    expect(comment.paragraphs[1]).toHaveLength(1000);
  });
});

describe("ticketSlackContent", () => {
  it("leaves out the description and comment text", () => {
    const slack = ticketSlackContent(
      "opened",
      ticket,
      { body: "secret comment", actor: { displayName: "Pat" } },
      url,
    );
    const all = JSON.stringify(slack);
    expect(all).not.toContain("Buzz on channel 4");
    expect(all).not.toContain("secret comment");
    expect(slack.lines).toEqual(["HNE-000012 Wedge monitor at Main Hall (HNE)", "Reported by Pat"]);
  });
});
