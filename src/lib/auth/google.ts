import "server-only";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/forms/prisma-errors";
import { allowedGoogleIdentity, type GoogleClaims } from "./google-policy";

/**
 * Holds the organization a Google sign-in started from, across the round trip
 * to Google: set by the sign-in page just before it redirects there.
 */
export const GOOGLE_ORGANIZATION_COOKIE = "roadcase.google-organization";

/** Google sign-in needs the OAuth client from the deployment's environment. */
export function googleConfigured(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

export interface SignInSettings {
  googleAllowedDomains: string[];
  passwordSignIn: boolean;
  adminPasswordSignIn: boolean;
}

/**
 * The sign-in methods an organization offers. Passwords stay on whenever
 * Google isn't offered (no allowed domains, or Google not set up on this
 * deployment), so turning Google off never locks everyone out.
 */
export function signInMethods(organization: SignInSettings) {
  const google = googleConfigured() && organization.googleAllowedDomains.length > 0;
  return {
    google,
    passwordSignIn: organization.passwordSignIn || !google,
    adminPasswordSignIn: organization.adminPasswordSignIn,
  };
}

export interface GoogleSignInUser {
  id: string;
  organizationId: string;
  name: string;
  sessionVersion: number;
}

/**
 * The account a Google sign-in is for, or null when it's refused for any
 * reason (callers show one message for all of them). The Google account must
 * be verified and in an allowed domain. It then signs in the active account it
 * was linked to before or, the first time, the active account with the same
 * email that isn't linked to another Google account; that links them.
 */
export async function resolveGoogleSignIn(
  organizationSlug: string,
  claims: GoogleClaims,
): Promise<GoogleSignInUser | null> {
  const organization = await db.organization.findUnique({
    where: { slug: organizationSlug },
    select: { id: true, googleAllowedDomains: true },
  });
  if (!organization) return null;
  const identity = allowedGoogleIdentity(claims, organization.googleAllowedDomains);
  if (!identity) return null;

  const select = {
    id: true,
    organizationId: true,
    displayName: true,
    isActive: true,
    sessionVersion: true,
    googleSubject: true,
  } as const;
  // A linked account wins; an email match only counts while it's unlinked.
  const user =
    (await db.user.findUnique({
      where: {
        organizationId_googleSubject: {
          organizationId: organization.id,
          googleSubject: identity.subject,
        },
      },
      select,
    })) ??
    (await db.user.findUnique({
      where: { organizationId_email: { organizationId: organization.id, email: identity.email } },
      select,
    }));
  if (!user?.isActive) return null;
  if (user.googleSubject !== null && user.googleSubject !== identity.subject) return null;

  const now = new Date();
  try {
    await db.user.update({
      where: { id: user.id },
      data: {
        googleSubject: identity.subject,
        googleEmail: identity.email,
        googleLastSignInAt: now,
        lastSignInAt: now,
      },
    });
  } catch (error) {
    // Another account linked this Google account at the same moment.
    if (isUniqueViolation(error)) return null;
    throw error;
  }
  return {
    id: user.id,
    organizationId: user.organizationId,
    name: user.displayName,
    sessionVersion: user.sessionVersion,
  };
}
