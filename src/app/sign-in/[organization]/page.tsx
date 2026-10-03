import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/authz";
import { safeCallbackUrl } from "@/lib/auth/redirect";
import { displayName, getBranding } from "@/lib/branding";
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
  return { title: { absolute: `Sign in · ${displayName(branding)}` } };
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
