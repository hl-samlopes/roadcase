"use client";

import {
  startTransition,
  useActionState,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { buttonClass } from "@/components/ui";
import type {
  BodyFont,
  FontPairing,
  HeadingFont,
  SignInLogoPlacement,
} from "@/generated/prisma/enums.ts";
import { initialFormState, type FormState } from "@/lib/forms/state";
import { contrastWarnings, describeWarning, tokenLabels } from "@/lib/theme/contrast";
import {
  accentPresets,
  bodyFontVariables,
  bodyTextPx,
  fontPairings,
  headingFontVariables,
  textScaleOptions,
} from "@/lib/theme/presets";
import {
  defaultDarkTokens,
  defaultLightTokens,
  themeTokenNames,
  type ThemeTokenName,
  type ThemeTokens,
} from "@/lib/theme/tokens";

export interface AppearanceValues {
  light: Partial<ThemeTokens>;
  dark: Partial<ThemeTokens>;
  headingFont: HeadingFont | "";
  bodyFont: BodyFont | "";
  radiusPx: number;
  textScale: number;
  displayName: string;
  signInHeadline: string;
  signInMessage: string;
  signInLogoPlacement: SignInLogoPlacement;
  appBackgroundDim: number;
  signInBackgroundDim: number;
  allowUserAccent: boolean;
  /** Empty means every accent is allowed. */
  allowedAccents: string[];
  allowedFontPairings: FontPairing[];
}

export interface AppearanceImages {
  logoLight: string | null;
  logoDark: string | null;
  appBackground: string | null;
  signInBackground: string | null;
}

type Mode = "light" | "dark";
const HEX = /^#[0-9a-f]{6}$/i;
const defaults: Record<Mode, ThemeTokens> = { light: defaultLightTokens, dark: defaultDarkTokens };

const headingFontLabels: Record<HeadingFont, string> = { INTER: "Inter", SPACE_MONO: "Space Mono" };
const bodyFontLabels: Record<BodyFont, string> = {
  KRUB: "Krub",
  PLUS_JAKARTA_SANS: "Plus Jakarta Sans",
};
const placementLabels: Record<SignInLogoPlacement, string> = {
  TOP: "Above the sign-in card",
  CENTER: "Inside the sign-in card",
  HIDDEN: "Hidden",
};

const control =
  "rounded-theme border border-border bg-surface px-2 py-1.5 text-text focus-visible:outline-2 focus-visible:outline-accent";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-theme border-border bg-surface flex flex-col gap-3 border p-4">
      <legend className="font-heading px-1 text-base font-bold">{title}</legend>
      {children}
    </fieldset>
  );
}

function Labeled({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {children}
      {hint ? <p className="text-muted">{hint}</p> : null}
    </div>
  );
}

/** Settings > Appearance editor with a live preview of the app shell and sign-in page. */
export function AppearanceEditor({
  action,
  initial,
  images,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial: AppearanceValues;
  images: AppearanceImages;
}) {
  const [values, setValues] = useState(initial);
  const [previewMode, setPreviewMode] = useState<Mode>("light");
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const set = <K extends keyof AppearanceValues>(key: K, value: AppearanceValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  /** Colors in effect: valid overrides on top of the Roadcase defaults. */
  const effective = useMemo(() => {
    const resolve = (mode: Mode) => {
      const tokens = { ...defaults[mode] };
      for (const name of themeTokenNames) {
        const value = values[mode][name];
        if (value && HEX.test(value)) tokens[name] = value.toUpperCase();
      }
      return tokens;
    };
    return { light: resolve("light"), dark: resolve("dark") };
  }, [values]);
  const warnings = contrastWarnings(effective.light, effective.dark);

  function setToken(mode: Mode, name: ThemeTokenName, value: string) {
    setValues((current) => ({ ...current, [mode]: { ...current[mode], [name]: value } }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const name = values.displayName.trim() || "Roadcase";
  const heading = (values.headingFont || "INTER") as HeadingFont;
  const body = (values.bodyFont || "KRUB") as BodyFont;
  const accentsAllowed =
    values.allowedAccents.length === 0 ? accentPresets.map((p) => p.key) : values.allowedAccents;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      <form action={formAction} onSubmit={onSubmit} className="flex flex-col gap-4">
        <Section title="Identity">
          <Labeled
            id="displayName"
            label="Display name"
            hint="Shown in the header, page titles, labels, emails and contract PDFs. Leave empty to show Roadcase."
          >
            <input
              id="displayName"
              name="displayName"
              value={values.displayName}
              maxLength={80}
              onChange={(e) => set("displayName", e.target.value)}
              className={control}
            />
          </Labeled>
        </Section>

        <Section title="Colors">
          <p className="text-muted">
            Leave a color empty to use the Roadcase default. Text colors need at least 4.5:1
            contrast with the backgrounds they sit on.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {(["light", "dark"] as const).map((mode) => (
              <div key={mode} className="flex flex-col gap-2">
                <h3 className="text-base">{mode === "light" ? "Light mode" : "Dark mode"}</h3>
                {themeTokenNames.map((token) => {
                  const id = `${mode}_${token}`;
                  const value = values[mode][token] ?? "";
                  const invalid = value !== "" && !HEX.test(value);
                  return (
                    <div key={token} className="flex flex-wrap items-end gap-2">
                      <div className="flex flex-col gap-1">
                        <label htmlFor={id} className="font-semibold">
                          {tokenLabels[token]}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            aria-label={`${tokenLabels[token]} color picker, ${mode} mode`}
                            value={effective[mode][token].toLowerCase()}
                            onChange={(e) => setToken(mode, token, e.target.value.toUpperCase())}
                            className="border-border h-8 w-10 rounded border bg-transparent"
                          />
                          <input
                            id={id}
                            name={id}
                            value={value}
                            placeholder={defaults[mode][token]}
                            onChange={(e) => setToken(mode, token, e.target.value.trim())}
                            aria-invalid={invalid || undefined}
                            aria-describedby={invalid ? `${id}-error` : undefined}
                            className={`${control} w-28 font-mono`}
                          />
                          {value ? (
                            <button
                              type="button"
                              onClick={() => setToken(mode, token, "")}
                              className="text-accent hover:underline"
                            >
                              Use default
                              <span className="sr-only">
                                {" "}
                                {tokenLabels[token]}, {mode} mode
                              </span>
                            </button>
                          ) : null}
                        </div>
                        {invalid ? (
                          <p id={`${id}-error`} className="text-bad">
                            Error: use a color like {defaults[mode][token]}.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div role="status" aria-live="polite">
            {warnings.length === 0 ? (
              <p>All text colors meet 4.5:1 contrast in both modes.</p>
            ) : (
              <div className="rounded-theme border-warn border p-2">
                <p className="text-warn font-semibold">Contrast warnings ({warnings.length})</p>
                <ul className="list-disc pl-5">
                  {warnings.map((warning) => (
                    <li key={`${warning.mode}-${warning.foreground}-${warning.background}`}>
                      Warning: {describeWarning(warning)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>

        <Section title="Fonts, corners and text size">
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled id="headingFont" label="Heading font">
              <select
                id="headingFont"
                name="headingFont"
                value={values.headingFont}
                onChange={(e) => set("headingFont", e.target.value as HeadingFont | "")}
                className={control}
              >
                <option value="">Default (Inter)</option>
                {Object.entries(headingFontLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled id="bodyFont" label="Body font">
              <select
                id="bodyFont"
                name="bodyFont"
                value={values.bodyFont}
                onChange={(e) => set("bodyFont", e.target.value as BodyFont | "")}
                className={control}
              >
                <option value="">Default (Krub)</option>
                {Object.entries(bodyFontLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled
              id="radiusPx"
              label="Corner radius (px)"
              hint="6 is the default; 0 gives square corners."
            >
              <input
                id="radiusPx"
                name="radiusPx"
                type="number"
                min={0}
                max={32}
                value={values.radiusPx}
                onChange={(e) => set("radiusPx", Number(e.target.value))}
                className={control}
              />
            </Labeled>
            <Labeled
              id="textScale"
              label="Default text size"
              hint="People can still choose their own size in Preferences."
            >
              <select
                id="textScale"
                name="textScale"
                value={values.textScale}
                onChange={(e) => set("textScale", Number(e.target.value))}
                className={control}
              >
                {textScaleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.value}%, body text {bodyTextPx(option.value)}px)
                  </option>
                ))}
              </select>
            </Labeled>
          </div>
        </Section>

        <Section title="Sign-in page">
          <Labeled
            id="signInHeadline"
            label="Headline"
            hint={`Leave empty for "Sign in to ${name}".`}
          >
            <input
              id="signInHeadline"
              name="signInHeadline"
              value={values.signInHeadline}
              maxLength={120}
              onChange={(e) => set("signInHeadline", e.target.value)}
              className={control}
            />
          </Labeled>
          <Labeled
            id="signInMessage"
            label="Welcome message"
            hint="Optional, shown under the headline."
          >
            <textarea
              id="signInMessage"
              name="signInMessage"
              rows={3}
              value={values.signInMessage}
              maxLength={1000}
              onChange={(e) => set("signInMessage", e.target.value)}
              className={control}
            />
          </Labeled>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 font-semibold">Logo placement</legend>
            {Object.entries(placementLabels).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="signInLogoPlacement"
                  value={value}
                  checked={values.signInLogoPlacement === value}
                  onChange={() => set("signInLogoPlacement", value as SignInLogoPlacement)}
                  className="accent-accent"
                />
                {label}
              </label>
            ))}
          </fieldset>
        </Section>

        <Section title="Background dimming">
          <p className="text-muted">
            A layer in the background color covers background images so text stays readable. Upload
            the images below.
          </p>
          {(
            [
              ["appBackgroundDim", "App background dimming"],
              ["signInBackgroundDim", "Sign-in background dimming"],
            ] as const
          ).map(([key, label]) => (
            <Labeled key={key} id={key} label={`${label}: ${values[key]}%`}>
              <input
                id={key}
                name={key}
                type="range"
                min={0}
                max={100}
                step={5}
                value={values[key]}
                onChange={(e) => set(key, Number(e.target.value))}
                className="accent-accent"
              />
            </Labeled>
          ))}
        </Section>

        <Section title="What people can change for themselves">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="allowUserAccent"
              checked={values.allowUserAccent}
              onChange={(e) => set("allowUserAccent", e.target.checked)}
              className="accent-accent"
            />
            Let people pick their own accent color
          </label>
          <fieldset className="flex flex-col gap-1" disabled={!values.allowUserAccent}>
            <legend className="mb-1 font-semibold">Accent colors offered</legend>
            {accentPresets.map((preset) => (
              <label key={preset.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="allowedAccents"
                  value={preset.key}
                  checked={accentsAllowed.includes(preset.key)}
                  onChange={(e) =>
                    set(
                      "allowedAccents",
                      e.target.checked
                        ? [...accentsAllowed, preset.key]
                        : accentsAllowed.filter((key) => key !== preset.key),
                    )
                  }
                  className="accent-accent"
                />
                <span
                  aria-hidden="true"
                  className="border-border flex overflow-hidden rounded-full border"
                >
                  <span className="h-4 w-4" style={{ backgroundColor: preset.light }} />
                  <span className="h-4 w-4" style={{ backgroundColor: preset.dark }} />
                </span>
                {preset.label}
              </label>
            ))}
            <p className="text-muted">
              Accents that would be hard to read on your colors are hidden from people
              automatically.
            </p>
          </fieldset>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 font-semibold">Font pairings offered</legend>
            {(Object.keys(fontPairings) as FontPairing[]).map((pairing) => (
              <label key={pairing} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="allowedFontPairings"
                  value={pairing}
                  checked={values.allowedFontPairings.includes(pairing)}
                  onChange={(e) =>
                    set(
                      "allowedFontPairings",
                      e.target.checked
                        ? [...values.allowedFontPairings, pairing]
                        : values.allowedFontPairings.filter((p) => p !== pairing),
                    )
                  }
                  className="accent-accent"
                />
                {fontPairings[pairing].label}
              </label>
            ))}
          </fieldset>
        </Section>

        {state.error ? (
          <div role="alert" className="border-bad text-bad rounded-theme border p-2">
            <p className="font-semibold">Error: {state.error}</p>
            {state.fieldErrors ? (
              <ul className="list-disc pl-5">
                {Object.entries(state.fieldErrors).map(([field, messages]) =>
                  messages?.length ? (
                    <li key={field}>
                      {field}: {messages.join(" ")}
                    </li>
                  ) : null,
                )}
              </ul>
            ) : null}
          </div>
        ) : null}
        {state.success ? <p role="status">Done: {state.success}</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={buttonClass("primary")}>
            {pending ? "Saving…" : "Save appearance"}
          </button>
          {warnings.length > 0 ? (
            <span className="text-muted">
              You can save with warnings, but some text may be hard to read.
            </span>
          ) : null}
        </div>
      </form>

      <aside aria-label="Preview" className="flex flex-col gap-3 xl:sticky xl:top-4 xl:self-start">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base">Preview</h2>
          <div role="group" aria-label="Preview mode" className="flex gap-1">
            {(["light", "dark"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={previewMode === mode}
                onClick={() => setPreviewMode(mode)}
                className={buttonClass(previewMode === mode ? "primary" : "secondary")}
              >
                {mode === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
        </div>
        <Preview
          tokens={effective[previewMode]}
          mode={previewMode}
          radiusPx={values.radiusPx}
          heading={heading}
          body={body}
          name={name}
          values={values}
          images={images}
        />
      </aside>
    </div>
  );
}

function Preview({
  tokens,
  mode,
  radiusPx,
  heading,
  body,
  name,
  values,
  images,
}: {
  tokens: ThemeTokens;
  mode: Mode;
  radiusPx: number;
  heading: HeadingFont;
  body: BodyFont;
  name: string;
  values: AppearanceValues;
  images: AppearanceImages;
}) {
  // The preview overrides the theme variables for its own subtree only.
  const style = {
    ...Object.fromEntries(themeTokenNames.map((token) => [`--${token}`, tokens[token]])),
    "--radius": `${Math.min(32, Math.max(0, radiusPx || 0))}px`,
    "--font-heading": `var(${headingFontVariables[heading]}), ui-sans-serif, system-ui, sans-serif`,
    "--font-body": `var(${bodyFontVariables[body]}), ui-sans-serif, system-ui, sans-serif`,
    colorScheme: mode,
  } as CSSProperties;
  const logo =
    mode === "dark" ? (images.logoDark ?? images.logoLight) : (images.logoLight ?? images.logoDark);
  const headline = values.signInHeadline.trim() || `Sign in to ${name}`;
  const placement = values.signInLogoPlacement;
  const logoImage = logo ? (
    // eslint-disable-next-line @next/next/no-img-element -- previewing an uploaded branding image
    <img src={logo} alt="" className="max-h-8 w-auto" />
  ) : null;

  return (
    <div
      style={style}
      className="font-body bg-bg text-text flex flex-col gap-3 rounded-lg p-3"
      aria-hidden="true"
    >
      <div className="rounded-theme border-border relative flex overflow-hidden border">
        {images.appBackground ? (
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images.appBackground} alt="" className="h-full w-full object-cover" />
            <div
              className="bg-bg absolute inset-0"
              style={{ opacity: values.appBackgroundDim / 100 }}
            />
          </div>
        ) : null}
        <div className="border-border bg-surface relative flex w-28 shrink-0 flex-col gap-1 border-r p-2">
          <div className="font-heading mb-1 truncate font-bold">{logoImage ?? name}</div>
          <div className="border-accent bg-bg rounded-theme border-l-4 px-2 py-1 font-semibold">
            Inventory
          </div>
          <div className="text-muted px-2 py-1">Service tickets</div>
          <div className="text-muted px-2 py-1">Settings</div>
        </div>
        <div className="relative flex min-w-0 flex-1 flex-col gap-2 p-3">
          <p className="font-heading text-xl font-bold">Inventory</p>
          <div className="rounded-theme border-border bg-surface border p-2">
            <p>
              <span className="text-accent underline">Wireless mic kit</span> · Good
            </p>
            <p className="text-muted">HLK-000001 · Meadow Ranch</p>
            <p className="text-warn">Warning: due for inspection</p>
            <p className="text-bad">Error: battery missing</p>
          </div>
          <div className="flex gap-2">
            <span className="bg-accent text-surface rounded-theme px-2 py-1 font-semibold">
              New item
            </span>
            <span className="border-border bg-surface rounded-theme border px-2 py-1 font-semibold">
              Export CSV
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-theme border-border relative flex flex-col items-center gap-2 overflow-hidden border p-4">
        {images.signInBackground ? (
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images.signInBackground} alt="" className="h-full w-full object-cover" />
            <div
              className="bg-bg absolute inset-0"
              style={{ opacity: values.signInBackgroundDim / 100 }}
            />
          </div>
        ) : null}
        {placement === "TOP" && logoImage ? <div className="relative">{logoImage}</div> : null}
        <div className="rounded-theme border-border bg-surface relative w-full max-w-60 border p-3">
          {placement === "CENTER" && logoImage ? <div className="mb-2">{logoImage}</div> : null}
          <p className="font-heading text-lg font-bold">{headline}</p>
          {values.signInMessage.trim() ? (
            <p className="text-muted whitespace-pre-line">{values.signInMessage.trim()}</p>
          ) : null}
          <p className="mt-2 font-semibold">Username</p>
          <div className="rounded-theme border-border bg-surface h-6 border" />
          <span className="bg-accent text-surface rounded-theme mt-2 inline-block px-2 py-1 font-semibold">
            Sign in
          </span>
        </div>
      </div>
    </div>
  );
}
