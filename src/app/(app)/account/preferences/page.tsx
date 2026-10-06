import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ActionForm } from "@/components/action-form";
import { Card, CheckboxField, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { getBranding } from "@/lib/branding";
import { getPreference } from "@/lib/preferences";
import {
  bodyTextPx,
  DEFAULT_TEXT_SCALE,
  fontPairings,
  textScaleOptions,
} from "@/lib/theme/presets";
import { availableAccents, availableFontPairings, isTextScale } from "@/lib/theme/resolve";
import { emailPreferenceFields, emailPreferencesOf } from "@/lib/notifications/recipients";
import { saveEmailPreferencesAction, savePreferencesAction } from "./actions";

export const metadata: Metadata = { title: "Preferences" };

const emailChoices = [
  { notice: "opened", label: "A ticket opens for equipment I manage" },
  { notice: "assigned", label: "A ticket is assigned to me or my department" },
  { notice: "completed", label: "A ticket I reported is completed" },
  { notice: "comment", label: "Someone comments on a ticket I reported or am assigned to" },
] as const;

const modes = [
  { value: "LIGHT", label: "Light" },
  { value: "DARK", label: "Dark" },
  { value: "SYSTEM", label: "Match my device" },
];

function Choice({
  name,
  value,
  checked,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  children: ReactNode;
}) {
  const id = `${name}-${value || "default"}`;
  return (
    <div className="flex items-center gap-2">
      <input
        type="radio"
        id={id}
        name={name}
        value={value}
        defaultChecked={checked}
        className="accent-accent"
      />
      <label htmlFor={id} className="flex items-center gap-2">
        {children}
      </label>
    </div>
  );
}

export default async function PreferencesPage() {
  const user = await requireUser();
  const [branding, preference] = await Promise.all([
    getBranding(user.organizationId),
    getPreference(user.id),
  ]);
  const accents = availableAccents(branding);
  const pairings = availableFontPairings(branding);
  const currentAccent = accents.some((a) => a.key === preference?.accent)
    ? preference!.accent!
    : "";
  const currentPairing =
    preference?.fontPairing && pairings.includes(preference.fontPairing)
      ? preference.fontPairing
      : "";

  const currentScale = isTextScale(preference?.textScale) ? String(preference.textScale) : "";
  const organizationScale = isTextScale(branding?.textScale)
    ? branding.textScale
    : DEFAULT_TEXT_SCALE;

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <PageHeader title="Preferences" />
      <Card>
        <ActionForm
          action={savePreferencesAction}
          submitLabel="Save preferences"
          className="flex flex-col gap-5"
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-semibold">Mode</legend>
            {modes.map((mode) => (
              <Choice
                key={mode.value}
                name="themeMode"
                value={mode.value}
                checked={(preference?.themeMode ?? "LIGHT") === mode.value}
              >
                {mode.label}
              </Choice>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-semibold">Accent color</legend>
            <Choice name="accent" value="" checked={currentAccent === ""}>
              Organization default
            </Choice>
            {accents.map((accent) => (
              <Choice
                key={accent.key}
                name="accent"
                value={accent.key}
                checked={currentAccent === accent.key}
              >
                {/* Swatches show the preset in light and dark mode; the name is the label. */}
                <span
                  aria-hidden="true"
                  className="border-border flex overflow-hidden rounded-full border"
                >
                  <span className="h-4 w-4" style={{ backgroundColor: accent.light }} />
                  <span className="h-4 w-4" style={{ backgroundColor: accent.dark }} />
                </span>
                {accent.label}
              </Choice>
            ))}
            {accents.length === 0 ? (
              <p className="text-muted">Your organization sets the accent color.</p>
            ) : null}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-semibold">Fonts</legend>
            <Choice name="fontPairing" value="" checked={currentPairing === ""}>
              Organization default
            </Choice>
            {pairings.map((pairing) => (
              <Choice
                key={pairing}
                name="fontPairing"
                value={pairing}
                checked={currentPairing === pairing}
              >
                {fontPairings[pairing].label}
              </Choice>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-semibold">Text size</legend>
            <Choice name="textScale" value="" checked={currentScale === ""}>
              Organization default ({organizationScale}%)
            </Choice>
            {textScaleOptions.map((option) => (
              <Choice
                key={option.value}
                name="textScale"
                value={String(option.value)}
                checked={currentScale === String(option.value)}
              >
                {option.label} ({option.value}%, body text {bodyTextPx(option.value)}px)
              </Choice>
            ))}
          </fieldset>
        </ActionForm>
      </Card>

      <Card title="Email">
        <ActionForm
          action={saveEmailPreferencesAction}
          submitLabel="Save email preferences"
          resetOnSuccess={false}
          className="flex flex-col gap-4"
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-semibold">Email me when</legend>
            {emailChoices.map((choice) => (
              <CheckboxField
                key={choice.notice}
                name={emailPreferenceFields[choice.notice]}
                label={choice.label}
                defaultChecked={emailPreferencesOf(preference)[choice.notice]}
              />
            ))}
            <CheckboxField
              name="emailRequestSent"
              label="A guest group sends or changes an equipment request where I run check-outs"
              defaultChecked={preference?.emailRequestSent ?? true}
            />
          </fieldset>
          <p className="text-muted">
            You only get email about tickets you can see. Slack alerts are set per campus or
            department by admins.
          </p>
        </ActionForm>
      </Card>
    </div>
  );
}
