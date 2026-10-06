import "server-only";
import { z } from "zod";
import { portalLinkLastDay, portalLinkStatus } from "@/lib/authz/portal-policy";
import { appUrl } from "@/lib/app-url";
import { appTimeZone, dateInZone } from "@/lib/checkouts/overdue";
import { db } from "@/lib/db";
import type { EmailContent } from "@/lib/email/layout";
import { formatDate } from "@/lib/format";
import { decryptSecret } from "@/lib/secrets";
import { hashPortalToken, portalPath } from "./token";

const data = z.object({ linkId: z.uuid(), sealedToken: z.string().min(1) });

/**
 * The "here's your portal" email to a guest group's representative. The job
 * carries the token encrypted (so pg-boss's tables never hold a working
 * link); it is decrypted here, checked against the stored hash, and only
 * sent while the link still works.
 */
export async function portalLinkEmail(
  organizationId: string,
  raw: Record<string, string>,
): Promise<{ content: EmailContent } | { skip: string }> {
  const parsed = data.safeParse(raw);
  if (!parsed.success) return { skip: "not a portal link email" };
  const link = await db.portalLink.findFirst({
    where: { id: parsed.data.linkId, organizationId },
    select: {
      tokenHash: true,
      revokedAt: true,
      guestGroup: {
        select: {
          name: true,
          repName: true,
          arrivalDate: true,
          departureDate: true,
          archivedAt: true,
          campus: { select: { name: true } },
          staffContact: { select: { displayName: true } },
        },
      },
    },
  });
  if (!link) return { skip: "portal link no longer exists" };
  const group = link.guestGroup;
  if (portalLinkStatus(link, group, dateInZone(new Date(), appTimeZone())) !== "active") {
    return { skip: "portal link no longer works" };
  }
  const token = decryptSecret(parsed.data.sealedToken);
  if (hashPortalToken(token) !== link.tokenHash) return { skip: "token doesn't match the link" };

  const lastDay = new Date(`${portalLinkLastDay(group.departureDate)}T00:00:00Z`);
  const contact = group.staffContact?.displayName;
  return {
    content: {
      subject: `Your group page for ${group.campus.name}: ${group.name}`,
      heading: `Hi ${group.repName}`,
      paragraphs: [
        `Here's ${group.name}'s page for your visit to ${group.campus.name}, ${formatDate(group.arrivalDate)} to ${formatDate(group.departureDate)}. You don't need an account: the button opens it.`,
        contact
          ? `${contact} is your contact for equipment and production questions.`
          : "Reply to the staff member who set up your visit with any equipment or production questions.",
        `The link works until ${formatDate(lastDay)}. Anyone with it can see your group's page, so share it only with your team.`,
      ],
      action: { label: "Open your group page", url: appUrl(portalPath(token)) },
      footer: "You're getting this because you're the contact for a group visiting this campus.",
    },
  };
}
