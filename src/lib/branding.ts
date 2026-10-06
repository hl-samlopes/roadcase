import "server-only";
import { cache } from "react";
import { brandingAssetUrl } from "@/lib/branding-url";
import { db } from "@/lib/db";

export { brandingAssetUrl };

export const DEFAULT_DISPLAY_NAME = "Roadcase";

/** An organization's branding row, or null to use the Roadcase defaults. */
export const getBranding = cache((organizationId: string) =>
  db.organizationBranding.findUnique({ where: { organizationId } }),
);

export type Branding = NonNullable<Awaited<ReturnType<typeof getBranding>>>;

export function displayName(branding: Branding | null): string {
  return branding?.displayName?.trim() || DEFAULT_DISPLAY_NAME;
}

/** Light and dark logo URLs; a single uploaded logo is used for both modes. */
export function logoUrls(branding: Branding | null) {
  const light = brandingAssetUrl(branding?.logoLightKey);
  const dark = brandingAssetUrl(branding?.logoDarkKey);
  return { light: light ?? dark, dark: dark ?? light };
}
