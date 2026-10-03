import "server-only";
import { z } from "zod";
import { can, type Actor } from "@/lib/authz";
import { db } from "@/lib/db";

const scope = {
  organizationId: true,
  campusId: true,
  locationId: true,
  departmentId: true,
} as const;

/**
 * An attachment the actor may read, judged by the record it belongs to, or
 * null (also for attachments that don't exist).
 */
export async function getReadableAttachment(actor: Actor, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const attachment = await db.attachment.findUnique({
    where: { id },
    include: {
      item: { select: scope },
      ticket: { select: scope },
      serviceLog: { select: scope },
    },
  });
  if (!attachment || attachment.organizationId !== actor.organizationId) return null;
  const allowed =
    (attachment.item && can(actor, "item:read", attachment.item)) ||
    (attachment.ticket && can(actor, "ticket:read", attachment.ticket)) ||
    (attachment.serviceLog && can(actor, "serviceLog:read", attachment.serviceLog));
  return allowed ? attachment : null;
}

/** URL that serves an attachment through the permission-checking route. */
export function attachmentUrl(id: string, options: { download?: boolean } = {}) {
  return `/attachments/${id}${options.download ? "?download=1" : ""}`;
}
