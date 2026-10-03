import { describe, expect, it } from "vitest";
import { CODE128_PATTERNS, code128Values, code128Widths } from "./code128";

describe("Code 128 pattern table", () => {
  it("has 107 unique symbols of 11 modules (stop is 13)", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
    CODE128_PATTERNS.forEach((pattern, value) => {
      const modules = [...pattern].reduce((sum, width) => sum + Number(width), 0);
      expect(modules, `value ${value}`).toBe(value === 106 ? 13 : 11);
      // Every symbol has 3 bars and 3 spaces with an even total of bar modules.
      const bars = [...pattern].filter((_, i) => i % 2 === 0).reduce((s, w) => s + Number(w), 0);
      expect(bars % 2, `value ${value}`).toBe(0);
    });
  });
});

describe("code128Values", () => {
  it("adds start B, the weighted checksum and stop", () => {
    // "HNE-000123": start 104, then character values (code - 32).
    const values = code128Values("HNE-000123");
    const data = [40, 46, 37, 13, 16, 16, 16, 17, 18, 19];
    const checksum = data.reduce((sum, v, i) => sum + v * (i + 1), 104) % 103;
    expect(values).toEqual([104, ...data, checksum, 106]);
  });

  it("rejects characters outside code set B", () => {
    expect(() => code128Values("")).toThrow();
    expect(() => code128Values("café")).toThrow();
  });
});

describe("code128Widths", () => {
  it("is 11 modules per symbol plus 13 for stop", () => {
    const widths = code128Widths("HNE-000123");
    const modules = widths.reduce((sum, width) => sum + width, 0);
    expect(modules).toBe((10 + 2) * 11 + 13);
    expect(widths.length % 2).toBe(1); // starts and ends with a bar
  });
});
