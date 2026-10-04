import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader, TextField } from "@/components/ui";
import type { FontPairing } from "@/generated/prisma/enums.ts";
import { can, requireUser } from "@/lib/authz";
import { brandingAssetUrl, getBranding } from "@/lib/branding";
import { brandingImageKinds, brandingImages } from "@/lib/branding-images";
import { allFontPairings, DEFAULT_TEXT_SCALE } from "@/lib/theme/presets";
import { isHexColor, isTextScale } from "@/lib/theme/resolve";
import { themeTokenNames, type ThemeTokens } from "@/lib/theme/tokens";
import {
  removeBrandingImageAction,
  resetBrandingAction,
  saveAppearanceAction,
  uploadBrandingImageAction,
} from "./actions";
import { AppearanceEditor, type AppearanceValues } from "./appearance-editor";

export const metadata: Metadata = { title: "Appearance" };

function storedTokens(value: unknown): Partial<ThemeTokens> {
  const result: Partial<ThemeTokens> = {};
  if (value && typeof value === "object") {
    for (const name of themeTokenNames) {
      const color = (value as Record<string, unknown>)[name];
      if (isHexColor(color)) result[name] = color.toUpperCase();
    }
  }
  return result;
}

export default async function AppearancePage() {
  const user = await requireUser();
  if (!can(user, "settings:manage", { organizationId: user.organizationId })) notFound();
  const branding = await getBranding(user.organizationId);

  const initial: AppearanceValues = {
    light: storedTokens(branding?.lightTokens),
    dark: storedTokens(branding?.darkTokens),
    headingFont: branding?.headingFont ?? "",
    bodyFont: branding?.bodyFont ?? "",
    radiusPx: branding?.radiusPx ?? 6,
    textScale: isTextScale(branding?.textScale) ? branding.textScale : DEFAULT_TEXT_SCALE,
    displayName: branding?.displayName ?? "",
    signInHeadline: branding?.signInHeadline ?? "",
    signInMessage: branding?.signInMessage ?? "",
    signInLogoPlacement: branding?.signInLogoPlacement ?? "TOP",
    appBackgroundDim: branding?.appBackgroundDim ?? 60,
    signInBackgroundDim: branding?.signInBackgroundDim ?? 60,
    allowUserAccent: branding?.allowUserAccent ?? true,
    allowedAccents: branding?.allowedAccents ?? [],
    allowedFontPairings: (branding?.allowedFontPairings ?? allFontPairings) as FontPairing[],
  };
  const urls = Object.fromEntries(
    brandingImageKinds.map((kind) => [
      kind,
      brandingAssetUrl(branding?.[brandingImages[kind].field]),
    ]),
  ) as Record<(typeof brandingImageKinds)[number], string | null>;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/settings" className="text-accent hover:underline">
          Back to settings
        </Link>
      </div>
      <PageHeader title="Appearance" />
      <p className="text-muted max-w-3xl">
        Your organization&apos;s look for everyone, including the sign-in page. The guest portal,
        notification emails and contract PDFs will use the same branding when they arrive.
      </p>

      <AppearanceEditor
        action={saveAppearanceAction}
        initial={initial}
        images={{
          logoLight: urls.logoLight,
          logoDark: urls.logoDark,
          appBackground: urls.appBackground,
          signInBackground: urls.signInBackground,
        }}
      />

      <Card title="Logos, favicon and background images">
        <ul className="grid gap-4 md:grid-cols-2">
          {brandingImageKinds.map((kind) => {
            const spec = brandingImages[kind];
            const url = urls[kind];
            return (
              <li key={kind} className="border-border flex flex-col gap-2 border-b pb-4">
                <h3 className="font-semibold">{spec.label}</h3>
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded branding image
                  <img
                    src={url}
                    alt={`Current ${spec.label.toLowerCase()}`}
                    className="rounded-theme border-border max-h-24 w-fit border object-contain"
                  />
                ) : (
                  <p className="text-muted">None uploaded.</p>
                )}
                <ActionForm
                  action={uploadBrandingImageAction.bind(null, kind)}
                  submitLabel={
                    url
                      ? `Replace ${spec.label.toLowerCase()}`
                      : `Upload ${spec.label.toLowerCase()}`
                  }
                  pendingLabel="Uploading…"
                  variant="secondary"
                  fieldLabels={{ file: spec.label }}
                >
                  <TextField
                    label={`Choose ${spec.label.toLowerCase()}`}
                    name="file"
                    id={`branding-${kind}`}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hint={spec.hint}
                    required
                  />
                </ActionForm>
                {url ? (
                  <ActionForm
                    action={removeBrandingImageAction.bind(null, kind)}
                    submitLabel={`Remove ${spec.label.toLowerCase()}`}
                    pendingLabel="Removing…"
                    variant="danger"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Reset to Roadcase defaults">
        <p className="text-muted mb-3">
          Clears every setting on this page and removes the uploaded images, restoring the Roadcase
          look. People&apos;s own preferences are kept.
        </p>
        <ActionForm
          action={resetBrandingAction}
          submitLabel="Reset appearance to Roadcase defaults"
          pendingLabel="Resetting…"
          variant="danger"
        />
      </Card>
    </div>
  );
}
