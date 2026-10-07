import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/authz";
import { safeCallbackUrl } from "@/lib/auth/redirect";
import { getBranding } from "@/lib/branding";
import { resolveOrganization } from "@/lib/organization";
import { SignInScreen } from "./sign-in-screen";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { callbackUrl, error } = await searchParams;
  const destination = safeCallbackUrl(callbackUrl);
  if (await getCurrentUser()) redirect(destination);

  const organization = await resolveOrganization((await headers()).get("host"));
  const branding = organization ? await getBranding(organization.id) : null;
  return (
    <SignInScreen
      organization={organization}
      branding={branding}
      callbackUrl={destination}
      error={typeof error === "string" ? error : undefined}
    />
  );
}
