import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { getCurrentUser } from "@/lib/authz";
import { getBranding } from "@/lib/branding";
import { resolveOrganization } from "@/lib/organization";
import { getPreference } from "@/lib/preferences";
import { resolveTheme } from "./resolve";

/**
 * Branding and theme for the current request: the signed-in user's
 * organization and preferences, or for visitors the organization resolved
 * from the address with the default light mode.
 */
export const getThemeContext = cache(async () => {
  const user = await getCurrentUser();
  if (user) {
    const [branding, preference] = await Promise.all([
      getBranding(user.organizationId),
      getPreference(user.id),
    ]);
    return { user, branding, preference, theme: resolveTheme(branding, preference) };
  }

  const organization = await resolveOrganization((await headers()).get("host"));
  const branding = organization ? await getBranding(organization.id) : null;
  return { user: null, branding, preference: null, theme: resolveTheme(branding, null) };
});
