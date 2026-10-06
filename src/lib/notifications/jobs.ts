import "server-only";
import { appUrl } from "@/lib/app-url";
import { displayName, getBranding } from "@/lib/branding";
import { db } from "@/lib/db";
import { enqueue } from "@/lib/jobs/boss";
import type { ParsedPayload } from "@/lib/jobs/queues";
import { decryptSecret } from "@/lib/secrets";
import { postToSlack, slackMessage } from "@/lib/slack";
import { ticketSlackContent } from "./content";
import { loadCandidates, loadNoticeEvent, loadNoticeTicket } from "./data";
import { isTicketRecipient, slackTicketNotices } from "./recipients";

/**
 * Worker handler for ticket.notify: picks the recipients and the Slack
 * webhooks for one ticket event and queues a job for each, so each email and
 * post retries on its own. Keys make a retried fan-out safe.
 */
export async function fanOutTicketNotice(payload: ParsedPayload<"ticket.notify">) {
  const { organizationId, ticketId, eventId, notice, actorId } = payload;
  const ticket = await loadNoticeTicket(organizationId, ticketId);
  if (!ticket) return { emails: 0, slack: 0 };

  const recipients = (await loadCandidates(organizationId)).filter((candidate) =>
    isTicketRecipient(notice, ticket, actorId, candidate),
  );
  for (const recipient of recipients) {
    const key = `ticket:${eventId}:${recipient.id}`;
    await enqueue(
      "email.send",
      {
        organizationId,
        idempotencyKey: key,
        recipient: { userId: recipient.id },
        template: "ticket",
        data: { ticketId, eventId, notice },
      },
      { key },
    );
  }

  const webhooks = slackTicketNotices.includes(notice)
    ? await db.slackWebhook.findMany({
        where: {
          organizationId,
          OR: [{ campusId: ticket.campusId }, { departmentId: ticket.departmentId }],
        },
        select: { id: true },
      })
    : [];
  for (const webhook of webhooks) {
    await enqueue(
      "slack.post",
      { kind: "ticket", organizationId, webhookId: webhook.id, ticketId, eventId, notice },
      { key: `${eventId}:${webhook.id}` },
    );
  }
  return { emails: recipients.length, slack: webhooks.length };
}

/** Worker handler for slack.post: decrypts the webhook only here, right before posting. */
export async function postSlackJob(payload: ParsedPayload<"slack.post">) {
  const webhook = await db.slackWebhook.findFirst({
    where: { id: payload.webhookId, organizationId: payload.organizationId },
    select: { label: true, encryptedUrl: true },
  });
  if (!webhook) return { skipped: "webhook was removed" };

  let message;
  if (payload.kind === "test") {
    const name = displayName(await getBranding(payload.organizationId));
    message = slackMessage({
      headline: `Test message from ${name}`,
      lines: [`Ticket alerts for ${webhook.label} will post here.`],
    });
  } else {
    const [ticket, event] = await Promise.all([
      loadNoticeTicket(payload.organizationId, payload.ticketId),
      loadNoticeEvent(payload.ticketId, payload.eventId),
    ]);
    if (!ticket || !event) return { skipped: "ticket or event no longer exists" };
    message = slackMessage(
      ticketSlackContent(payload.notice, ticket, event, appUrl(`/tickets/${ticket.id}`)),
    );
  }

  await postToSlack(decryptSecret(webhook.encryptedUrl), message);
  return { skipped: null };
}
