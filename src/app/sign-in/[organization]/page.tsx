import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/authz";
import { safeCallbackUrl } from "@/lib/auth/redirect";
import { brandingAssetUrl, displayName, getBranding } from "@/lib/branding";
import { resolveOrganization } from "@/lib/organization";
import { SignInScreen } from "../sign-in-screen";

async function load(slug: string) {
  const organization = await resolveOrganization(null, slug);
  if (!organization) notFound();
  return { organization, branding: await getBranding(organization.id) };
}

export async function generateMetadata({
  params,
}: PageProps<"/sign-in/[organization]">): Promise<Metadata> {
  const { branding } = await load((await params).organization);
  const favicon = brandingAssetUrl(branding?.faviconKey);
  return {
    title: { absolute: `Sign in · ${displayName(branding)}` },
    // The root layout's icon follows the address's default organization, so set this one's.
    ...(favicon ? { icons: { icon: favicon } } : {}),
  };
}

export default async function OrganizationSignInPage({
  params,
  searchParams,
}: PageProps<"/sign-in/[organization]">) {
  const destination = safeCallbackUrl((await searchParams).callbackUrl);
  if (await getCurrentUser()) redirect(destination);

  const { organization, branding } = await load((await params).organization);
  return <SignInScreen organization={organization} branding={branding} callbackUrl={destination} />;
}
