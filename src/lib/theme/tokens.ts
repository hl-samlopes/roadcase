/**
 * Roadcase default design tokens (Concept A "Utility").
 * Mirrors the fallback CSS variables in `src/app/globals.css`; organization branding
 * stores overrides keyed by these same names.
 */
export const themeTokenNames = [
  "bg",
  "surface",
  "text",
  "muted",
  "border",
  "accent",
  "warn",
  "bad",
] as const;

export type ThemeTokenName = (typeof themeTokenNames)[number];
export type ThemeTokens = Record<ThemeTokenName, string>;

export const defaultLightTokens: ThemeTokens = {
  bg: "#F6F7F9",
  surface: "#FFFFFF",
  text: "#14181F",
  muted: "#566070",
  border: "#DDE1E8",
  accent: "#1B5FD1",
  warn: "#8A5A00",
  bad: "#B3361B",
};

export const defaultDarkTokens: ThemeTokens = {
  bg: "#0F1319",
  surface: "#171C24",
  text: "#EDF0F5",
  muted: "#9AA5B5",
  border: "#2A313C",
  accent: "#6EA2FF",
  warn: "#F0B84A",
  bad: "#FF8A6B",
};

export const defaultRadius = "6px";

/** WCAG relative luminance of a #RRGGBB color. */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Expected a #RRGGBB color, got "${hex}"`);
  const value = parseInt(match[1], 16);
  const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG contrast ratio between two #RRGGBB colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
