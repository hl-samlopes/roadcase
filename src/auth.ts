import NextAuth, { CredentialsSignin } from "next-auth";
import { headers } from "next/headers";
import Credentials from "next-auth/providers/credentials";
import { verifyCredentials } from "@/lib/auth/credentials";
import { clientAddress } from "@/lib/auth/throttle-policy";

/** Thrown when too many failed attempts have locked the username or address. */
export class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

/**
 * Auth.js setup: username and password against our own users table, with a
 * signed, encrypted JWT cookie. The token only identifies the user; grants and
 * account status are loaded from the database on every request
 * (see `src/lib/authz/session.ts`), so changes apply immediately.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/sign-in" },
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
  ],
  callbacks: {
    jwt({ token, user }) {
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
