import type { BodyFont, FontPairing, HeadingFont } from "@/generated/prisma/enums.ts";

/**
 * Accent colors users may pick. Each has a light and a dark variant chosen to
 * keep at least 4.5:1 contrast against the default backgrounds and surfaces
 * (see presets.test.ts). Stored by key in UserPreference.accent.
 */
export const accentPresets = [
  { key: "blue", label: "Blue", light: "#1B5FD1", dark: "#6EA2FF" },
  { key: "teal", label: "Teal", light: "#0A6E68", dark: "#3CC7B8" },
  { key: "purple", label: "Purple", light: "#6A3FC2", dark: "#B49CFF" },
  { key: "green", label: "Green", light: "#1D7A35", dark: "#5CCB7A" },
  { key: "orange", label: "Orange", light: "#A94700", dark: "#FF9D57" },
  { key: "magenta", label: "Magenta", light: "#AD2378", dark: "#FF80C8" },
] as const;

export type AccentPreset = (typeof accentPresets)[number];
export type AccentKey = AccentPreset["key"];

export function findAccentPreset(key: string | null | undefined): AccentPreset | undefined {
  return accentPresets.find((preset) => preset.key === key);
}

export const fontPairings: Record<
  FontPairing,
  { label: string; heading: HeadingFont; body: BodyFont }
> = {
  INTER_KRUB: { label: "Inter and Krub", heading: "INTER", body: "KRUB" },
  SPACE_MONO_PLUS_JAKARTA_SANS: {
    label: "Space Mono and Plus Jakarta Sans",
    heading: "SPACE_MONO",
    body: "PLUS_JAKARTA_SANS",
  },
};

export const allFontPairings = Object.keys(fontPairings) as FontPairing[];

/** CSS variables set by next/font in the root layout. */
export const headingFontVariables: Record<HeadingFont, string> = {
  INTER: "--font-inter",
  SPACE_MONO: "--font-space-mono",
};

export const bodyFontVariables: Record<BodyFont, string> = {
  KRUB: "--font-krub",
  PLUS_JAKARTA_SANS: "--font-plus-jakarta-sans",
};

/**
 * Text sizes users may choose, as a percentage of the default. The root font
 * size scales by this, so text and spacing grow together and the browser's
 * own font size setting still applies.
 */
export const textScaleOptions = [
  { value: 100, label: "Default" },
  { value: 115, label: "Large" },
  { value: 130, label: "Larger" },
  { value: 150, label: "Largest" },
  { value: 175, label: "Extra large" },
] as const;

export const DEFAULT_TEXT_SCALE = 100;

/** Body text size in px at a given scale (12px at 100%). */
export function bodyTextPx(scale: number): number {
  return Math.round(12 * scale) / 100;
}
