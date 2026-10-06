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

const requestData = z.object({
  requestId: z.uuid(),
  submittedAt: z.iso.datetime(),
  linkId: z.uuid().optional(),
  sealedToken: z.string().min(1).optional(),
});

/** The group's page link for an email, if the sealed token still matches a working link. */
async function sealedPortalUrl(organizationId: string, linkId?: string, sealedToken?: string) {
  if (!linkId || !sealedToken) return null;
  const link = await db.portalLink.findFirst({
    where: { id: linkId, organizationId },
    select: {
      tokenHash: true,
      revokedAt: true,
      guestGroup: { select: { archivedAt: true, departureDate: true } },
    },
  });
  if (!link) return null;
  if (portalLinkStatus(link, link.guestGroup, dateInZone(new Date(), appTimeZone())) !== "active") {
    return null;
  }
  const token = decryptSecret(sealedToken);
  return hashPortalToken(token) === link.tokenHash ? appUrl(portalPath(token)) : null;
}

/**
 * "We got your request": a copy of what the group sent. Skipped if the group
 * has sent changes since (that send has its own email) or took it back.
 */
export async function portalRequestEmail(
  organizationId: string,
  raw: Record<string, string>,
): Promise<{ content: EmailContent } | { skip: string }> {
  const parsed = requestData.safeParse(raw);
  if (!parsed.success) return { skip: "not a request email" };
  const request = await db.equipmentRequest.findFirst({
    where: { id: parsed.data.requestId, organizationId },
    select: {
      status: true,
      note: true,
      submittedAt: true,
      lines: { orderBy: { name: "asc" }, select: { name: true, quantityRequested: true } },
      guestGroup: {
        select: {
          name: true,
          repName: true,
          arrivalDate: true,
          departureDate: true,
          archivedAt: true,
          campus: { select: { name: true } },
        },
      },
    },
  });
  if (!request || request.guestGroup.archivedAt) return { skip: "request no longer exists" };
  if (request.submittedAt?.toISOString() !== parsed.data.submittedAt) {
    return { skip: "a newer version was sent" };
  }
  if (request.status !== "SUBMITTED") return { skip: "request isn't waiting for staff" };

  const group = request.guestGroup;
  const url = await sealedPortalUrl(organizationId, parsed.data.linkId, parsed.data.sealedToken);
  return {
    content: {
      subject: `We got your equipment request: ${group.name}`,
      heading: "Your equipment request",
      paragraphs: [
        `Thanks, ${group.repName}. Here's what ${group.name} asked for from ${group.campus.name} for ${formatDate(group.arrivalDate)} to ${formatDate(group.departureDate)}:`,
        ...request.lines.map((line) => `${line.quantityRequested} × ${line.name}`),
        ...(request.note ? [`Your note: ${request.note}`] : []),
        "Staff will review it and let you know. Until they start, you can change it on your group page.",
      ],
      ...(url ? { action: { label: "Open your group page", url } } : {}),
      footer: "You're getting this because you sent an equipment request for your group.",
    },
  };
}
