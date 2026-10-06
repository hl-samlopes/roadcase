import type { EmailContent } from "@/lib/email/layout";
import { assigneeLabel } from "@/lib/labels";
import type { TicketNotice } from "./recipients";

/**
 * Words for ticket emails and Slack posts. Messages link to the ticket and
 * never include attachment contents; comment text is included only in email
 * to people who can see the ticket, and capped.
 */

export interface ContentTicket {
  number: number;
  title: string;
  description: string | null;
  assigneeType: string | null;
  vendorName: string | null;
  assigneeUser: { displayName: string } | null;
  assigneeDepartment: { name: string } | null;
  item: { code: string; name: string };
  location: { name: string };
  campus: { code: string };
}

export interface ContentEvent {
  body: string | null;
  actor: { displayName: string } | null;
}

const MAX_QUOTE = 1000;

function quote(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_QUOTE ? `${trimmed.slice(0, MAX_QUOTE - 1)}…` : trimmed;
}

function where(ticket: ContentTicket) {
  return `${ticket.item.code} ${ticket.item.name} at ${ticket.location.name} (${ticket.campus.code})`;
}

function headline(notice: TicketNotice, ticket: ContentTicket) {
  const ref = `#${ticket.number}`;
  switch (notice) {
    case "opened":
      return `${ref} opened: ${ticket.title}`;
    case "assigned":
      return `${ref} assigned to ${assigneeLabel(ticket) ?? "someone"}: ${ticket.title}`;
    case "completed":
      return `${ref} completed: ${ticket.title}`;
    case "comment":
      return `New comment on ${ref}: ${ticket.title}`;
  }
}

const reasons: Record<TicketNotice, string> = {
  opened: "You're getting this because you can manage tickets for this equipment.",
  assigned: "You're getting this because the ticket was assigned to you or your department.",
  completed: "You're getting this because you reported the problem.",
  comment: "You're getting this because you reported or are assigned to this ticket.",
};

export function ticketEmailContent(
  notice: TicketNotice,
  ticket: ContentTicket,
  event: ContentEvent,
  ticketUrl: string,
): EmailContent {
  const actor = event.actor?.displayName ?? "Someone";
  const paragraphs: string[] = [];
  switch (notice) {
    case "opened": {
      paragraphs.push(`${actor} reported a problem with ${where(ticket)}.`);
      const details = quote(ticket.description);
      if (details) paragraphs.push(`Details: ${details}`);
      break;
    }
    case "assigned":
      paragraphs.push(
        `${actor} assigned this ticket to ${assigneeLabel(ticket) ?? "someone"}. It's for ${where(ticket)}.`,
      );
      break;
    case "completed": {
      paragraphs.push(`${actor} completed this ticket for ${where(ticket)}.`);
      const summary = quote(event.body);
      if (summary) paragraphs.push(summary);
      break;
    }
    case "comment": {
      paragraphs.push(`${actor} commented on the ticket for ${where(ticket)}:`);
      paragraphs.push(quote(event.body) ?? "(no text)");
      break;
    }
  }
  return {
    subject: headline(notice, ticket),
    heading: `Ticket #${ticket.number}: ${ticket.title}`,
    paragraphs,
    action: { label: `Open ticket #${ticket.number}`, url: ticketUrl },
    footer: `${reasons[notice]} You can turn these emails off in Preferences.`,
  };
}

/** Slack gets the headline and where, never descriptions or comment text. */
export function ticketSlackContent(
  notice: TicketNotice,
  ticket: ContentTicket,
  event: ContentEvent,
  ticketUrl: string,
) {
  const actor = event.actor?.displayName ?? "Someone";
  const by: Record<TicketNotice, string> = {
    opened: `Reported by ${actor}`,
    assigned: `Assigned by ${actor}`,
    completed: `Completed by ${actor}`,
    comment: `Comment by ${actor}`,
  };
  return {
    headline: headline(notice, ticket),
    lines: [where(ticket), by[notice]],
    link: { label: `Open ticket #${ticket.number}`, url: ticketUrl },
  };
}
