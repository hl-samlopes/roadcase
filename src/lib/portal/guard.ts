import "server-only";
import { portalCan, resolvePortal, type PortalAction } from "@/lib/authz";
import { isThrottled, recordFailure } from "@/lib/auth/throttle";
import { portalLinkKey, portalWriteLimit } from "@/lib/auth/throttle-policy";
import type { FormState } from "@/lib/forms/state";

const LINK_GONE: FormState = {
  error: "This link no longer works. Ask your staff contact for a new one.",
};
const TOO_MANY: FormState = {
  error: "That's a lot of changes in a short time. Wait a few minutes, then try again.",
};

/**
 * For a portal action that changes something: the portal for this token,
 * allowed to do `action` and not paused for making too many changes, or the
 * form error to show. Every call counts toward the link's limit, whatever
 * happens next.
 */
export async function portalForChange(token: string, action: PortalAction) {
  const portal = await resolvePortal(token);
  if (!portal || !portalCan(portal.principal, action, portal.principal)) {
    return { error: LINK_GONE };
  }
  const keys = [{ key: portalLinkKey(portal.principal.linkId), limit: portalWriteLimit }];
  if (await isThrottled(keys)) return { error: TOO_MANY };
  await recordFailure(keys);
  return { portal };
}
