import { describe, expect, it } from "vitest";
import { availability, parseCodes, refusalMessage, type AvailabilityItem } from "./availability";

const good: AvailabilityItem = {
  code: "HNE-000001",
  name: "Wedge",
  condition: { label: "Good", availableForCheckout: true },
  heldBy: null,
};

describe("availability", () => {
  it("allows an item in an available condition that no check-out holds", () => {
    expect(availability(good, "co-1")).toBeNull();
  });

  it("refuses items in a condition that isn't available", () => {
    const refusal = availability(
      { ...good, condition: { label: "Needs repair", availableForCheckout: false } },
      "co-1",
    );
    expect(refusal).toEqual({ reason: "condition", condition: "Needs repair" });
    expect(refusalMessage(refusal!)).toBe(
      "Its condition, Needs repair, isn't available for check-out.",
    );
  });

  it("names the other check-out holding the item, or says it's already on this one", () => {
    const held = { ...good, heldBy: { checkoutId: "co-2", number: 4, groupName: "Youth group" } };
    expect(refusalMessage(availability(held, "co-1")!)).toBe("It's on check-out #4 (Youth group).");
    expect(availability(held, "co-2")).toEqual({ reason: "already-added" });
  });

  it("reports being held before the condition", () => {
    const both = {
      condition: { label: "Poor", availableForCheckout: false },
      heldBy: { checkoutId: "co-2", number: 4, groupName: "Youth group" },
      code: "X",
      name: "Y",
    };
    expect(availability(both, "co-1")?.reason).toBe("on-checkout");
  });
});

describe("parseCodes", () => {
  it("reads scanned or pasted codes", () => {
    expect(parseCodes(" hne-000001\nHNE-000002, hne-000001 ;HNE-000003 ")).toEqual([
      "HNE-000001",
      "HNE-000002",
      "HNE-000003",
    ]);
    expect(parseCodes("   ")).toEqual([]);
    expect(parseCodes("A B C", 2)).toEqual(["A", "B"]);
  });
});
