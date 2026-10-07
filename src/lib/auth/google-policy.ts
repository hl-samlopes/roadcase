import { z } from "zod";

/** The id token claims Google sign-in relies on. */
export interface GoogleClaims {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  /** The Google Workspace domain; absent for personal Gmail accounts. */
  hd?: unknown;
}

/**
 * Google's verified identity when its Workspace domain is one the
 * organization allows, otherwise null. The email must be verified, and its
 * domain allowed too (a Workspace can have secondary domains; list each).
 */
export function allowedGoogleIdentity(
  claims: GoogleClaims,
  allowedDomains: readonly string[],
): { subject: string; email: string } | null {
  const { sub, email, email_verified: verified, hd } = claims;
  if (typeof sub !== "string" || !sub) return null;
  if (typeof email !== "string" || verified !== true) return null;
  if (typeof hd !== "string") return null;
  const address = email.toLowerCase();
  const emailDomain = address.slice(address.lastIndexOf("@") + 1);
  if (!allowedDomains.includes(hd.toLowerCase()) || !allowedDomains.includes(emailDomain)) {
    return null;
  }
  return { subject: sub, email: address };
}

/** Whether a password may be used to sign in, under the organization's settings. */
export function passwordSignInAllowed(
  organization: { passwordSignIn: boolean; adminPasswordSignIn: boolean },
  isOrganizationAdmin: boolean,
): boolean {
  return organization.passwordSignIn || (isOrganizationAdmin && organization.adminPasswordSignIn);
}

const domainPattern = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Allowed domains as typed in Settings: one per line or comma separated. */
export const allowedDomainsSchema = z
  .string()
  .max(2000)
  .transform((text) =>
    text
      .split(/[\s,]+/)
      .map((value) => value.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean),
  )
  .pipe(
    z
      .array(z.string().regex(domainPattern, "Enter domains such as hume.org, one per line."))
      .max(20, "List at most 20 domains."),
  )
  .transform((domains) => [...new Set(domains)]);
