import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

export const DEFAULT_DISPLAY_NAME = "Roadcase";

/** An organization's branding row, or null to use the Roadcase defaults. */
export const getBranding = cache((organizationId: string) =>
  db.organizationBranding.findUnique({ where: { organizationId } }),
);

export type Branding = NonNullable<Awaited<ReturnType<typeof getBranding>>>;

export function displayName(branding: Branding | null): string {
  return branding?.displayName?.trim() || DEFAULT_DISPLAY_NAME;
}

/** Public URL of a branding image stored under the public branding/ prefix. */
export function brandingAssetUrl(key: string | null | undefined): string | null {
  const base = process.env.S3_PUBLIC_BASE_URL;
  if (!key || !base || !key.startsWith("branding/")) return null;
  return `${base.replace(/\/+$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Light and dark logo URLs; a single uploaded logo is used for both modes. */
export function logoUrls(branding: Branding | null) {
  const light = brandingAssetUrl(branding?.logoLightKey);
  const dark = brandingAssetUrl(branding?.logoDarkKey);
  return { light: light ?? dark, dark: dark ?? light };
}
