import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    organizationId?: string;
    sessionVersion?: number;
  }

  interface Session {
    user: {
      id: string;
      organizationId: string;
      sessionVersion: number;
    } & DefaultSession["user"];
  }
}
