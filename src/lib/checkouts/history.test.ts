import { describe, expect, it } from "vitest";
import { buildHistory, type HistorySource } from "./history";

const at = (time: string) => new Date(`2026-10-0${time}Z`);

const source: HistorySource = {
  createdAt: at("1T09:00:00"),
  createdBy: "Sam",
  cancelledAt: null,
  returnedAt: at("5T10:00:00"),
  contracts: [
    {
      preparedAt: at("1T09:30:00"),
      preparedBy: "Sam",
      voidedAt: at("1T09:40:00"),
      signedAt: null,
      signatures: [],
    },
    {
      preparedAt: at("1T10:00:00"),
      preparedBy: "Sam",
      voidedAt: null,
      signedAt: at("1T10:06:00"),
      signatures: [
        { role: "GUEST", printedName: "Morgan", signedAt: at("1T10:05:00") },
        { role: "STAFF", printedName: "Sam", signedAt: at("1T10:06:00") },
      ],
    },
  ],
  returns: [
    {
      returnedAt: at("4T16:00:00"),
      returnedBy: "Jo",
      code: "HNE-1",
      name: "Wedge",
      condition: "Good",
      notes: null,
    },
    {
      returnedAt: at("4T16:00:00"),
      returnedBy: "Jo",
      code: "HNE-2",
      name: "Mixer",
      condition: "Needs repair",
      notes: "Fader 3 dead",
    },
    {
      returnedAt: at("5T10:00:00"),
      returnedBy: "Sam",
      code: "HNE-3",
      name: "Stand",
      condition: "Good",
      notes: null,
    },
  ],
  tickets: [
    { createdAt: at("4T16:00:00"), number: 7, code: "HNE-2", title: "Needs repair on return" },
  ],
};

describe("buildHistory", () => {
  it("orders events in the same second by what happens first, whatever clock stamped them", () => {
    const back = new Date("2026-10-04T16:00:00.100Z");
    const history = buildHistory({
      ...source,
      returnedAt: back,
      returns: [{ ...source.returns[1], returnedAt: back }],
      // The database stamped the ticket a few milliseconds after the app's clock.
      tickets: [{ ...source.tickets[0], createdAt: new Date("2026-10-04T16:00:00.180Z") }],
    }).map((entry) => entry.text);
    expect(history.slice(-3)).toEqual([
      "Checked in by Jo: 1 item",
      "Ticket #7 opened for HNE-2: Needs repair on return",
      "Everything is back",
    ]);
  });

  it("tells the whole story in order, grouping items checked in together", () => {
    const history = buildHistory(source);
    expect(history.map((entry) => entry.text)).toEqual([
      "Created by Sam",
      "Contract prepared by Sam",
      "Returned to draft; that contract was set aside",
      "Contract prepared by Sam",
      "Signed by Morgan (guest representative)",
      "Signed by Sam (staff representative)",
      "Contract signed; equipment out",
      "Checked in by Jo: 2 items",
      "Ticket #7 opened for HNE-2: Needs repair on return",
      "Checked in by Sam: 1 item",
      "Everything is back",
    ]);
    expect(history[7].details).toEqual([
      "HNE-1 Wedge: Good",
      "HNE-2 Mixer: Needs repair. Fader 3 dead",
    ]);
  });
});
