import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "./redirect";

describe("safeCallbackUrl", () => {
  it("keeps same-origin paths", () => {
    expect(safeCallbackUrl("/items/abc?tab=history")).toBe("/items/abc?tab=history");
  });

  it.each([
    ["https://evil.example/items"],
    ["//evil.example"],
    ["/\\evil.example"],
    ["javascript:alert(1)"],
    ["/items\n/x"],
    [""],
    [undefined],
    [42],
  ])("rejects %j", (value) => {
    expect(safeCallbackUrl(value)).toBe("/items");
  });
});
