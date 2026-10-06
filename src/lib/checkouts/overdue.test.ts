import { describe, expect, it } from "vitest";
import { appTimeZone, dateInZone, daysOverdue, remindToday } from "./overdue";

const due = (day: string) => new Date(`${day}T00:00:00Z`);

describe("dateInZone", () => {
  it("uses the calendar date where the organization is", () => {
    // 02:30 UTC on Oct 7 is still Oct 6 in New York and Los Angeles.
    const moment = new Date("2026-10-07T02:30:00Z");
    expect(dateInZone(moment, "America/New_York")).toBe("2026-10-06");
    expect(dateInZone(moment, "America/Los_Angeles")).toBe("2026-10-06");
    expect(dateInZone(moment, "Europe/London")).toBe("2026-10-07");
  });

  it("falls back to US Eastern for a missing or unknown zone", () => {
    expect(appTimeZone({})).toBe("America/New_York");
    expect(appTimeZone({ APP_TIME_ZONE: "Mars/Olympus_Mons" })).toBe("America/New_York");
    expect(appTimeZone({ APP_TIME_ZONE: "America/Los_Angeles" })).toBe("America/Los_Angeles");
  });
});

describe("daysOverdue", () => {
  it("counts from the day after the due date while items are out", () => {
    const out = { status: "OUT", dateDue: due("2026-10-06") };
    expect(daysOverdue(out, "2026-10-06")).toBe(0);
    expect(daysOverdue(out, "2026-10-07")).toBe(1);
    expect(daysOverdue({ ...out, status: "PARTIALLY_RETURNED" }, "2026-10-10")).toBe(4);
  });

  it("is never overdue once returned, cancelled or not yet out", () => {
    for (const status of ["RETURNED", "CANCELLED", "DRAFT", "AWAITING_SIGNATURES"]) {
      expect(daysOverdue({ status, dateDue: due("2026-10-01") }, "2026-10-10")).toBe(0);
    }
  });
});

describe("remindToday", () => {
  it("reminds on the first overdue day, then weekly", () => {
    const days = Array.from({ length: 16 }, (_, i) => i).filter(remindToday);
    expect(days).toEqual([1, 8, 15]);
  });
});
