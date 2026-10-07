import NextAuth, { CredentialsSignin } from "next-auth";
import { cookies, headers } from "next/headers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { verifyCredentials } from "@/lib/auth/credentials";
import {
  GOOGLE_ORGANIZATION_COOKIE,
  googleConfigured,
  resolveGoogleSignIn,
} from "@/lib/auth/google";
import { clientAddress } from "@/lib/auth/throttle-policy";

/** Thrown when too many failed attempts have locked the username or address. */
export class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

/** Where a refused Google sign-in lands: its organization's sign-in page, with one message. */
function googleRefusedUrl(organizationSlug: string | undefined) {
  return `${organizationSlug ? `/sign-in/${encodeURIComponent(organizationSlug)}` : "/sign-in"}?error=google`;
}

/**
 * Auth.js setup: username and password against our own users table, and
 * Google for organizations that allow it, with a signed, encrypted JWT cookie. The token only identifies the user; grants and
 * account status are loaded from the database on every request
 * (see `src/lib/authz/session.ts`), so changes apply immediately.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/sign-in", error: "/sign-in" },
  logger: {
    // A failed sign-in is expected user behavior, not a server error.
    error(error) {
      if (error.name === "CredentialsSignin") return;
      console.error(error);
    },
  },
  providers: [
    Credentials({
      credentials: { organization: {}, username: {}, password: {} },
      async authorize(credentials) {
        const result = await verifyCredentials(credentials, clientAddress(await headers()));
        if (result.status === "locked") throw new TooManyAttempts();
        return result.status === "ok" ? result.user : null;
      },
    }),
    ...(googleConfigured()
      ? [
          Google({
            // Lets someone with several Google accounts pick the work one.
            authorization: { params: { prompt: "select_account" } },
            // End-to-end tests point this at a stand-in for Google; never in production.
            ...(process.env.NODE_ENV !== "production" && process.env.AUTH_GOOGLE_ISSUER
              ? { issuer: process.env.AUTH_GOOGLE_ISSUER }
              : {}),
          }),
        ]
      : []),
  ],
  callbacks: {
    /**
     * A Google sign-in becomes the Roadcase account it resolves to. Auth.js
     * hands this same user object to `jwt` below, so the account's ids replace
     * Google's there.
     */
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;
      const organizationSlug = (await cookies()).get(GOOGLE_ORGANIZATION_COOKIE)?.value;
      const resolved =
        organizationSlug && profile ? await resolveGoogleSignIn(organizationSlug, profile) : null;
      if (!resolved) return googleRefusedUrl(organizationSlug);
      Object.assign(user, resolved, { email: null, image: null });
      return true;
    },
    jwt({ token, user, account }) {
      // Never issue a session for a Google sign-in that didn't resolve to an account.
      if (account?.provider === "google" && !user?.organizationId) return null;
      if (user) {
        token.sub = user.id;
        token.org = user.organizationId;
        token.sv = user.sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = typeof token.sub === "string" ? token.sub : "";
      session.user.organizationId = typeof token.org === "string" ? token.org : "";
      session.user.sessionVersion = typeof token.sv === "number" ? token.sv : -1;
      return session;
    },
  },
});
