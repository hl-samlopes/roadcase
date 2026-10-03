import type { BodyFont, FontPairing, HeadingFont, ThemeMode } from "@/generated/prisma/enums.ts";
import {
  accentPresets,
  allFontPairings,
  bodyFontVariables,
  DEFAULT_TEXT_SCALE,
  findAccentPreset,
  fontPairings,
  headingFontVariables,
  textScaleOptions,
  type AccentPreset,
} from "./presets";
import {
  contrastRatio,
  defaultDarkTokens,
  defaultLightTokens,
  defaultRadius,
  themeTokenNames,
  type ThemeTokens,
} from "./tokens";

/** The parts of OrganizationBranding that affect the theme. */
export interface BrandingThemeInput {
  lightTokens: unknown;
  darkTokens: unknown;
  headingFont: HeadingFont | null;
  bodyFont: BodyFont | null;
  radiusPx: number | null;
  textScale: number | null;
  allowUserAccent: boolean;
  allowedAccents: string[];
  allowedFontPairings: FontPairing[];
}

/** The parts of UserPreference that affect the theme. */
export interface PreferenceThemeInput {
  themeMode: ThemeMode;
  accent: string | null;
  fontPairing: FontPairing | null;
  textScale: number | null;
}

export interface ResolvedTheme {
  /** "system" follows the device setting. */
  mode: "light" | "dark" | "system";
  light: ThemeTokens;
  dark: ThemeTokens;
  radiusPx: number;
  /** Percentage applied to the root font size. */
  textScale: number;
  headingFont: HeadingFont;
  bodyFont: BodyFont;
}

const MIN_CONTRAST = 4.5;
const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

/** Applies valid #RRGGBB overrides for known token names; ignores anything else. */
function mergeTokens(base: ThemeTokens, overrides: unknown): ThemeTokens {
  const merged = { ...base };
  if (overrides && typeof overrides === "object") {
    for (const name of themeTokenNames) {
      const value = (overrides as Record<string, unknown>)[name];
      if (isHexColor(value)) merged[name] = value.toUpperCase();
    }
  }
  return merged;
}

function readable(color: string, tokens: ThemeTokens): boolean {
  return (
    contrastRatio(color, tokens.bg) >= MIN_CONTRAST &&
    contrastRatio(color, tokens.surface) >= MIN_CONTRAST
  );
}

export function isTextScale(value: unknown): value is number {
  return textScaleOptions.some((option) => option.value === value);
}

/** Organization colors with no user choices applied. */
export function organizationTokens(branding: BrandingThemeInput | null) {
  return {
    light: mergeTokens(defaultLightTokens, branding?.lightTokens),
    dark: mergeTokens(defaultDarkTokens, branding?.darkTokens),
  };
}

/**
 * Accents a user may pick: allowed by the organization and readable on the
 * organization's backgrounds in both light and dark mode.
 */
export function availableAccents(branding: BrandingThemeInput | null): AccentPreset[] {
  if (branding && !branding.allowUserAccent) return [];
  const { light, dark } = organizationTokens(branding);
  const allowed = branding?.allowedAccents ?? [];
  return accentPresets.filter(
    (preset) =>
      (allowed.length === 0 || allowed.includes(preset.key)) &&
      readable(preset.light, light) &&
      readable(preset.dark, dark),
  );
}

export function availableFontPairings(branding: BrandingThemeInput | null): FontPairing[] {
  const allowed = branding?.allowedFontPairings ?? allFontPairings;
  return allFontPairings.filter((pairing) => allowed.includes(pairing));
}

/** Roadcase defaults, then organization branding, then the user's allowed choices. */
export function resolveTheme(
  branding: BrandingThemeInput | null,
  preference: PreferenceThemeInput | null,
): ResolvedTheme {
  const { light, dark } = organizationTokens(branding);

  const accent = findAccentPreset(preference?.accent);
  if (accent && availableAccents(branding).some((preset) => preset.key === accent.key)) {
    light.accent = accent.light;
    dark.accent = accent.dark;
  }

  let headingFont: HeadingFont = branding?.headingFont ?? "INTER";
  let bodyFont: BodyFont = branding?.bodyFont ?? "KRUB";
  const pairing = preference?.fontPairing;
  if (pairing && availableFontPairings(branding).includes(pairing)) {
    headingFont = fontPairings[pairing].heading;
    bodyFont = fontPairings[pairing].body;
  }

  const radius = branding?.radiusPx;
  const radiusPx =
    typeof radius === "number" && Number.isInteger(radius) && radius >= 0 && radius <= 32
      ? radius
      : parseInt(defaultRadius, 10);

  const textScale = isTextScale(preference?.textScale)
    ? preference.textScale
    : isTextScale(branding?.textScale)
      ? branding.textScale
      : DEFAULT_TEXT_SCALE;

  const mode = preference?.themeMode
    ? (preference.themeMode.toLowerCase() as ResolvedTheme["mode"])
    : "light";

  return { mode, light, dark, radiusPx, textScale, headingFont, bodyFont };
}

function declarations(tokens: ThemeTokens): string {
  // Values are re-checked so nothing but #RRGGBB can reach the stylesheet.
  return themeTokenNames
    .map((name) => (isHexColor(tokens[name]) ? `--${name}:${tokens[name]};` : ""))
    .join("");
}

/** Stylesheet for a resolved theme, injected in the document head. */
export function themeCss(theme: ResolvedTheme): string {
  const shared =
    `--radius:${theme.radiusPx}px;` +
    `--text-scale:${isTextScale(theme.textScale) ? theme.textScale / 100 : 1};` +
    `--font-heading:var(${headingFontVariables[theme.headingFont]}),ui-sans-serif,system-ui,sans-serif;` +
    `--font-body:var(${bodyFontVariables[theme.bodyFont]}),ui-sans-serif,system-ui,sans-serif;`;
  const light = declarations(theme.light);
  const dark = declarations(theme.dark);
  return (
    `:root{${shared}${light}color-scheme:light}` +
    `:root[data-theme="dark"]{${dark}color-scheme:dark}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}color-scheme:dark}}`
  );
}
