import { describe, expect, it } from "vitest";
import { accentPresets } from "./presets";
import {
  availableAccents,
  availableFontPairings,
  resolveTheme,
  themeCss,
  type BrandingThemeInput,
} from "./resolve";
import { contrastRatio, defaultDarkTokens, defaultLightTokens } from "./tokens";

const branding = (overrides: Partial<BrandingThemeInput> = {}): BrandingThemeInput => ({
  lightTokens: null,
  darkTokens: null,
  headingFont: null,
  bodyFont: null,
  radiusPx: null,
  allowUserAccent: true,
  allowedAccents: [],
  allowedFontPairings: ["INTER_KRUB", "SPACE_MONO_PLUS_JAKARTA_SANS"],
  ...overrides,
});

describe("accent presets", () => {
  it.each(accentPresets)("$label stays readable on default backgrounds", (preset) => {
    for (const bg of [defaultLightTokens.bg, defaultLightTokens.surface]) {
      expect(contrastRatio(preset.light, bg)).toBeGreaterThanOrEqual(4.5);
    }
    for (const bg of [defaultDarkTokens.bg, defaultDarkTokens.surface]) {
      expect(contrastRatio(preset.dark, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("resolveTheme", () => {
  it("uses the Roadcase defaults with no branding or preferences", () => {
    const theme = resolveTheme(null, null);
    expect(theme).toEqual({
      mode: "light",
      light: defaultLightTokens,
      dark: defaultDarkTokens,
      radiusPx: 6,
      headingFont: "INTER",
      bodyFont: "KRUB",
    });
  });

  it("applies valid organization overrides and ignores invalid ones", () => {
    const theme = resolveTheme(
      branding({
        lightTokens: { bg: "#fafafa", text: "red", unknown: "#000000" },
        darkTokens: { surface: "#101010", accent: "#12345" },
        radiusPx: 0,
        headingFont: "SPACE_MONO",
      }),
      null,
    );
    expect(theme.light.bg).toBe("#FAFAFA");
    expect(theme.light.text).toBe(defaultLightTokens.text);
    expect(theme.light).not.toHaveProperty("unknown");
    expect(theme.dark.surface).toBe("#101010");
    expect(theme.dark.accent).toBe(defaultDarkTokens.accent);
    expect(theme.radiusPx).toBe(0);
    expect(theme.headingFont).toBe("SPACE_MONO");
    expect(theme.bodyFont).toBe("KRUB");
  });

  it("rejects an out-of-range radius", () => {
    expect(resolveTheme(branding({ radiusPx: 400 }), null).radiusPx).toBe(6);
  });

  it("applies the user's mode, accent and font pairing", () => {
    const theme = resolveTheme(branding(), {
      themeMode: "DARK",
      accent: "teal",
      fontPairing: "SPACE_MONO_PLUS_JAKARTA_SANS",
    });
    expect(theme.mode).toBe("dark");
    expect(theme.light.accent).toBe("#0A6E68");
    expect(theme.dark.accent).toBe("#3CC7B8");
    expect(theme.headingFont).toBe("SPACE_MONO");
    expect(theme.bodyFont).toBe("PLUS_JAKARTA_SANS");
  });

  it("ignores accents and pairings the organization does not allow", () => {
    const theme = resolveTheme(
      branding({ allowedAccents: ["purple"], allowedFontPairings: ["INTER_KRUB"] }),
      { themeMode: "SYSTEM", accent: "teal", fontPairing: "SPACE_MONO_PLUS_JAKARTA_SANS" },
    );
    expect(theme.mode).toBe("system");
    expect(theme.light.accent).toBe(defaultLightTokens.accent);
    expect(theme.headingFont).toBe("INTER");
  });

  it("ignores user accents when the organization locks the accent", () => {
    const locked = branding({ allowUserAccent: false });
    expect(availableAccents(locked)).toEqual([]);
    expect(
      resolveTheme(locked, { themeMode: "LIGHT", accent: "teal", fontPairing: null }).light.accent,
    ).toBe(defaultLightTokens.accent);
  });

  it("drops accents that would be unreadable on the organization's colors", () => {
    // A dark organization surface in light mode makes dark accents unreadable.
    const darkish = branding({ lightTokens: { surface: "#333333" } });
    const keys = availableAccents(darkish).map((preset) => preset.key);
    expect(keys).not.toContain("purple");
    const theme = resolveTheme(darkish, {
      themeMode: "LIGHT",
      accent: "purple",
      fontPairing: null,
    });
    expect(theme.light.accent).toBe(defaultLightTokens.accent);
  });

  it("lists font pairings in a stable order", () => {
    expect(availableFontPairings(null)).toEqual(["INTER_KRUB", "SPACE_MONO_PLUS_JAKARTA_SANS"]);
    expect(
      availableFontPairings(branding({ allowedFontPairings: ["SPACE_MONO_PLUS_JAKARTA_SANS"] })),
    ).toEqual(["SPACE_MONO_PLUS_JAKARTA_SANS"]);
  });
});

describe("themeCss", () => {
  it("emits light, explicit dark and system dark rules", () => {
    const css = themeCss(resolveTheme(null, null));
    expect(css).toContain(":root{--radius:6px;");
    expect(css).toContain("--font-heading:var(--font-inter)");
    expect(css).toContain("--bg:#F6F7F9;");
    expect(css).toContain(':root[data-theme="dark"]{--bg:#0F1319;');
    expect(css).toContain('@media (prefers-color-scheme: dark){:root:not([data-theme="light"])');
  });

  it("never lets non-color values into the stylesheet", () => {
    const theme = resolveTheme(null, null);
    theme.light.bg = "red;}body{display:none";
    expect(themeCss(theme)).not.toContain("display:none");
  });
});
