"use server";

import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { signIn } from "@/auth";
import { GOOGLE_ORGANIZATION_COOKIE, signInMethods } from "@/lib/auth/google";
import { safeCallbackUrl } from "@/lib/auth/redirect";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/forms/state";

export async function signInAction(_state: FormState, formData: FormData): Promise<FormState> {
  try {
    await signIn("credentials", {
      organization: formData.get("organization"),
      username: formData.get("username"),
      password: formData.get("password"),
      redirectTo: safeCallbackUrl(formData.get("callbackUrl")),
    });
  } catch (error) {
    // signIn redirects by throwing; only authentication failures are handled here.
    if (error instanceof AuthError && (error as { code?: string }).code === "rate_limited") {
      return {
        error:
          "Too many failed sign-in attempts. Wait 15 minutes and try again, or ask an admin to unlock your account.",
      };
    }
    if (error instanceof AuthError) {
      return { error: "That username and password don't match an active account." };
    }
    throw error;
  }
  return {};
}

/**
 * Starts a Google sign-in for the organization whose sign-in page this is:
 * remembers the organization for Google's return, then redirects to Google.
 */
export async function googleSignInAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const slug = formData.get("organization");
  const organization =
    typeof slug === "string" && slug.length <= 100
      ? await db.organization.findUnique({
          where: { slug },
          select: {
            slug: true,
            googleAllowedDomains: true,
            passwordSignIn: true,
            adminPasswordSignIn: true,
          },
        })
      : null;
  if (!organization || !signInMethods(organization).google) {
    return { error: "Google sign-in isn't available here." };
  }
  (await cookies()).set(GOOGLE_ORGANIZATION_COOKIE, organization.slug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
    maxAge: 10 * 60,
  });
  // Redirects to Google by throwing.
  await signIn("google", { redirectTo: safeCallbackUrl(formData.get("callbackUrl")) });
  return {};
}
