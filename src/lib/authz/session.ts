import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { can, type Action, type Actor, type ScopedResource } from "./policy";

export interface CurrentUser extends Actor {
  username: string;
  displayName: string;
  email: string;
  organization: { id: string; name: string; slug: string };
}

/**
 * The signed-in user with their grants, loaded fresh from the database once per
 * request. Returns null when there is no session, the account is inactive, or
 * the session predates a password change, reset or deactivation.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      organizationId: true,
      username: true,
      displayName: true,
      email: true,
      isActive: true,
      sessionVersion: true,
      organization: { select: { id: true, name: true, slug: true } },
      grants: {
        select: {
          level: true,
          scopeType: true,
          campusId: true,
          locationId: true,
          departmentId: true,
          canSubmitTickets: true,
        },
      },
    },
  });

  if (
    !user ||
    !user.isActive ||
    user.organizationId !== session.user.organizationId ||
    user.sessionVersion !== session.user.sessionVersion
  ) {
    return null;
  }
  return user;
});

/** For pages and actions that need a signed-in user; others go to sign-in. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Throws ForbiddenError unless the actor may perform the action. */
export function assertCan(actor: Actor, action: Action, resource: ScopedResource): void {
  if (!can(actor, action, resource)) throw new ForbiddenError();
}
