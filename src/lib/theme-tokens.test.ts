import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  defaultDarkTokens,
  defaultLightTokens,
  type ThemeTokenName,
} from "./theme-tokens";

const foregrounds: ThemeTokenName[] = ["text", "muted", "accent", "warn", "bad"];
const backgrounds: ThemeTokenName[] = ["bg", "surface"];

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for identical colors", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#1B5FD1", "#1B5FD1")).toBe(1);
  });

  it("rejects malformed colors", () => {
    expect(() => contrastRatio("blue", "#FFFFFF")).toThrow();
  });
});

describe.each([
  ["light", defaultLightTokens],
  ["dark", defaultDarkTokens],
])("default %s tokens", (_mode, tokens) => {
  for (const fg of foregrounds) {
    for (const bg of backgrounds) {
      it(`${fg} on ${bg} meets 4.5:1`, () => {
        expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
