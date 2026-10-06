import { can, type Actor, type ScopedResource } from "@/lib/authz/policy";

/** Ticket events people can be emailed about (each can be turned off in Preferences). */
export const ticketNotices = ["opened", "assigned", "completed", "comment"] as const;
export type TicketNotice = (typeof ticketNotices)[number];

/** UserPreference column (and Preferences form field) for each notice; unchecked means off. */
export const emailPreferenceFields = {
  opened: "emailTicketOpened",
  assigned: "emailTicketAssigned",
  completed: "emailTicketCompleted",
  comment: "emailTicketComment",
} as const satisfies Record<TicketNotice, string>;

/** Notices that also post to Slack; comments stay out of shared channels. */
export const slackTicketNotices: readonly TicketNotice[] = ["opened", "assigned", "completed"];

export interface NoticeTicket extends ScopedResource {
  campusId: string;
  locationId: string;
  departmentId: string;
  reporterId: string | null;
  assigneeType: "USER" | "DEPARTMENT" | "VENDOR" | null;
  assigneeUserId: string | null;
  assigneeDepartmentId: string | null;
}

export interface NoticeCandidate extends Actor {
  /** Opt-outs from Preferences; a missing preference row means everything is on. */
  emailPreferences: Record<TicketNotice, boolean>;
}

/** Editors and admins whose grant is on the assigned department itself. */
function editsDepartment(candidate: NoticeCandidate, ticket: NoticeTicket) {
  const departmentId = ticket.assigneeDepartmentId;
  if (!departmentId) return false;
  const departmentGrants = candidate.grants.filter(
    (grant) => grant.scopeType === "DEPARTMENT" && grant.departmentId === departmentId,
  );
  return can({ ...candidate, grants: departmentGrants }, "ticket:manage", {
    organizationId: ticket.organizationId,
    departmentId,
  });
}

/**
 * Whether this person should get an email about this ticket event. Checked
 * when the email is queued and again when it is sent, so someone who loses
 * access (or opts out) in between gets nothing. Nobody is emailed about
 * their own action.
 */
export function isTicketRecipient(
  notice: TicketNotice,
  ticket: NoticeTicket,
  actorId: string | null,
  candidate: NoticeCandidate,
): boolean {
  if (!candidate.isActive || candidate.organizationId !== ticket.organizationId) return false;
  if (candidate.id === actorId) return false;
  if (!candidate.emailPreferences[notice]) return false;
  if (!can(candidate, "ticket:read", ticket)) return false;

  switch (notice) {
    case "opened":
      return can(candidate, "ticket:manage", ticket);
    case "assigned":
      return ticket.assigneeType === "USER"
        ? candidate.id === ticket.assigneeUserId
        : ticket.assigneeType === "DEPARTMENT" && editsDepartment(candidate, ticket);
    case "completed":
      return candidate.id === ticket.reporterId;
    case "comment":
      return (
        candidate.id === ticket.reporterId ||
        (ticket.assigneeType === "USER" && candidate.id === ticket.assigneeUserId)
      );
  }
}

/** Maps a UserPreference row (or none) to the per-notice switches. */
export function emailPreferencesOf(
  preference: {
    emailTicketOpened: boolean;
    emailTicketAssigned: boolean;
    emailTicketCompleted: boolean;
    emailTicketComment: boolean;
  } | null,
): Record<TicketNotice, boolean> {
  return {
    opened: preference?.emailTicketOpened ?? true,
    assigned: preference?.emailTicketAssigned ?? true,
    completed: preference?.emailTicketCompleted ?? true,
    comment: preference?.emailTicketComment ?? true,
  };
}
