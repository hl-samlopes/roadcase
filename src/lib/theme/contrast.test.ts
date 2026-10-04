import { describe, expect, it } from "vitest";
import { contrastWarnings, describeWarning } from "./contrast";
import { defaultDarkTokens, defaultLightTokens } from "./tokens";

describe("contrastWarnings", () => {
  it("has no warnings for the Roadcase defaults", () => {
    expect(contrastWarnings(defaultLightTokens, defaultDarkTokens)).toEqual([]);
  });

  it("flags low-contrast pairs per mode with a readable message", () => {
    const warnings = contrastWarnings(
      { ...defaultLightTokens, muted: "#CCCCCC" },
      defaultDarkTokens,
    );
    expect(warnings.map((w) => `${w.mode}:${w.foreground}/${w.background}`)).toEqual([
      "light:muted/bg",
      "light:muted/surface",
    ]);
    expect(describeWarning(warnings[1])).toBe(
      "Muted text on surface in light mode is 1.6:1; it needs at least 4.5:1.",
    );
  });
});
