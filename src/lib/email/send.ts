import "server-only";
import { z } from "zod";
import type { BodyFont, HeadingFont } from "@/generated/prisma/enums.ts";
import { appUrl } from "@/lib/app-url";
import { displayName, getBranding, logoUrls } from "@/lib/branding";
import { db } from "@/lib/db";
import type { ParsedPayload } from "@/lib/jobs/queues";
import { ticketEmailContent } from "@/lib/notifications/content";
import { loadCandidate, loadNoticeEvent, loadNoticeTicket } from "@/lib/notifications/data";
import { isTicketRecipient, ticketNotices } from "@/lib/notifications/recipients";
import { can } from "@/lib/authz/policy";
import { resolveTheme } from "@/lib/theme/resolve";
import { renderBrandedEmail, type EmailBrand, type EmailContent } from "./layout";
import { overdueEmail } from "@/lib/checkouts/overdue-job";
import { contractEmail } from "@/lib/contracts/email";
import {
  portalDecisionEmail,
  portalLinkEmail,
  portalRequestEmail,
  requestSentEmail,
} from "@/lib/portal/email";
import { isRequestApprover } from "@/lib/portal/requests";
import { emailProviderFromEnv, type EmailAddress, type EmailAttachment } from "./provider";
import { testEmailContent } from "./templates";

const fontNames: Record<HeadingFont | BodyFont, string> = {
  INTER: "Inter",
  SPACE_MONO: "Space Mono",
  KRUB: "Krub",
  PLUS_JAKARTA_SANS: "Plus Jakarta Sans",
};

/** Organization branding as emails use it: always the light colors. */
export async function emailBrand(organizationId: string): Promise<EmailBrand> {
  const branding = await getBranding(organizationId);
  const theme = resolveTheme(branding, null);
  return {
    name: displayName(branding),
    logoUrl: logoUrls(branding).light,
    colors: theme.light,
    headingFont: fontNames[theme.headingFont],
    bodyFont: fontNames[theme.bodyFont],
    radiusPx: theme.radiusPx,
  };
}

function fromAddress() {
  const address = process.env.EMAIL_FROM_ADDRESS?.trim();
  if (address) return address;
  if (process.env.NODE_ENV === "production") throw new Error("EMAIL_FROM_ADDRESS is not set");
  return "no-reply@roadcase.localhost";
}

const ticketData = z.object({
  ticketId: z.uuid(),
  eventId: z.uuid(),
  notice: z.enum(ticketNotices),
});

type Composed =
  { to: EmailAddress; content: EmailContent; attachments?: EmailAttachment[] } | { skip: string };

/**
 * Works out the address and content at send time. Ticket emails are checked
 * again here: a recipient who was deactivated, lost access or opted out since
 * the email was queued is skipped.
 */
async function compose(
  payload: ParsedPayload<"email.send">,
  organizationName: string,
): Promise<Composed> {
  const { organizationId, recipient } = payload;
  const candidate =
    "userId" in recipient ? await loadCandidate(organizationId, recipient.userId) : null;
  if ("userId" in recipient && !candidate?.isActive) return { skip: "recipient is inactive" };
  const to: EmailAddress = candidate
    ? { email: candidate.email, name: candidate.displayName }
    : (recipient as EmailAddress);

  switch (payload.template) {
    case "test":
      return { to, content: testEmailContent(payload.data, organizationName) };
    case "ticket": {
      const data = ticketData.safeParse(payload.data);
      if (!data.success || !candidate) return { skip: "not a ticket email for an account" };
      const [ticket, event] = await Promise.all([
        loadNoticeTicket(organizationId, data.data.ticketId),
        loadNoticeEvent(data.data.ticketId, data.data.eventId),
      ]);
      if (!ticket || !event) return { skip: "ticket or event no longer exists" };
      if (!isTicketRecipient(data.data.notice, ticket, event.actorId, candidate)) {
        return { skip: "recipient can no longer see the ticket or opted out" };
      }
      return {
        to,
        content: ticketEmailContent(
          data.data.notice,
          ticket,
          event,
          appUrl(`/tickets/${ticket.id}`),
        ),
      };
    }
    case "contract": {
      const composed = await contractEmail(organizationId, payload.data.contractId ?? "");
      return "skip" in composed ? composed : { to, ...composed };
    }
    case "overdue": {
      const composed = await overdueEmail(organizationId, payload.data.checkoutId ?? "");
      if ("skip" in composed) return composed;
      // The reminder carries the guest's contact details: only to someone who can see the check-out.
      if (
        !candidate ||
        !can(candidate, "checkout:read", { organizationId, campusId: composed.campusId })
      ) {
        return { skip: "recipient can no longer see this check-out" };
      }
      return { to, content: composed.content };
    }
    case "portal-link": {
      const composed = await portalLinkEmail(organizationId, payload.data);
      return "skip" in composed ? composed : { to, content: composed.content };
    }
    case "portal-request": {
      const composed = await portalRequestEmail(organizationId, payload.data);
      return "skip" in composed ? composed : { to, content: composed.content };
    }
    case "portal-decision": {
      const composed = await portalDecisionEmail(organizationId, payload.data);
      return "skip" in composed ? composed : { to, content: composed.content };
    }
    case "request-sent": {
      const composed = await requestSentEmail(organizationId, payload.data);
      if ("skip" in composed) return composed;
      // Only to someone who can still review it and still wants these emails.
      if (!candidate || !isRequestApprover(candidate, composed.request)) {
        return { skip: "recipient can no longer review this request or opted out" };
      }
      return { to, content: composed.content };
    }
  }
}

/**
 * Renders and sends one email in the organization's branding. Runs in the
 * worker from the email.send job; an email whose key was already sent is
 * skipped, so retries never send twice.
 */
export async function sendEmail(payload: ParsedPayload<"email.send">) {
  const sent = await db.sentEmail.findUnique({
    where: { idempotencyKey: payload.idempotencyKey },
    select: { id: true },
  });
  if (sent) return { skipped: "already sent" };

  const brand = await emailBrand(payload.organizationId);
  const composed = await compose(payload, brand.name);
  if ("skip" in composed) return { skipped: composed.skip };

  const { html, text } = renderBrandedEmail(brand, composed.content);
  const result = await emailProviderFromEnv().send({
    from: { email: fromAddress(), name: brand.name },
    to: [composed.to],
    subject: composed.content.subject,
    text,
    html,
    attachments: composed.attachments,
  });

  await db.sentEmail.create({
    data: {
      organizationId: payload.organizationId,
      idempotencyKey: payload.idempotencyKey,
      toAddress: composed.to.email.toLowerCase(),
      subject: composed.content.subject,
      providerMessageId: result.id,
    },
  });
  return { skipped: null };
}
