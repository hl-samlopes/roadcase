import { contrastRatio, type ThemeTokenName, type ThemeTokens } from "./tokens";

export const tokenLabels: Record<ThemeTokenName, string> = {
  bg: "Background",
  surface: "Surface",
  text: "Text",
  muted: "Muted text",
  border: "Border",
  accent: "Accent",
  warn: "Warning",
  bad: "Error",
};

/** Text-like colors and the backgrounds they appear on. */
const textPairs: [ThemeTokenName, ThemeTokenName][] = [
  ["text", "bg"],
  ["text", "surface"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["accent", "bg"],
  ["accent", "surface"],
  ["warn", "bg"],
  ["warn", "surface"],
  ["bad", "bg"],
  ["bad", "surface"],
];

export const MIN_TEXT_CONTRAST = 4.5;

export interface ContrastWarning {
  mode: "light" | "dark";
  foreground: ThemeTokenName;
  background: ThemeTokenName;
  ratio: number;
}

/** Pairs below 4.5:1 in either mode (buttons use surface text on accent, the same pair). */
export function contrastWarnings(light: ThemeTokens, dark: ThemeTokens): ContrastWarning[] {
  const warnings: ContrastWarning[] = [];
  for (const [mode, tokens] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    for (const [foreground, background] of textPairs) {
      const ratio = contrastRatio(tokens[foreground], tokens[background]);
      if (ratio < MIN_TEXT_CONTRAST) warnings.push({ mode, foreground, background, ratio });
    }
  }
  return warnings;
}

export function describeWarning(warning: ContrastWarning): string {
  return `${tokenLabels[warning.foreground]} on ${tokenLabels[warning.background].toLowerCase()} in ${warning.mode} mode is ${warning.ratio.toFixed(1)}:1; it needs at least ${MIN_TEXT_CONTRAST}:1.`;
}
