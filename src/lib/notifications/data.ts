import "server-only";
import { db } from "@/lib/db";
import { emailPreferencesOf, type NoticeCandidate } from "./recipients";

/**
 * Loads what notification jobs need. Imports only the database and the pure
 * policy so the worker can use it outside Next.js.
 */

const grantSelect = {
  level: true,
  scopeType: true,
  campusId: true,
  locationId: true,
  departmentId: true,
  canSubmitTickets: true,
} as const;

const preferenceSelect = {
  emailTicketOpened: true,
  emailTicketAssigned: true,
  emailTicketCompleted: true,
  emailTicketComment: true,
  emailRequestSent: true,
  emailBandSent: true,
} as const;

export function loadNoticeTicket(organizationId: string, ticketId: string) {
  return db.serviceTicket.findFirst({
    where: { id: ticketId, organizationId },
    select: {
      id: true,
      organizationId: true,
      campusId: true,
      locationId: true,
      departmentId: true,
      number: true,
      title: true,
      description: true,
      reporterId: true,
      assigneeType: true,
      assigneeUserId: true,
      assigneeDepartmentId: true,
      vendorName: true,
      assigneeUser: { select: { displayName: true } },
      assigneeDepartment: { select: { name: true } },
      item: { select: { code: true, name: true } },
      location: { select: { name: true } },
      campus: { select: { code: true } },
    },
  });
}

export type NoticeTicketDetail = NonNullable<Awaited<ReturnType<typeof loadNoticeTicket>>>;

export function loadNoticeEvent(ticketId: string, eventId: string) {
  return db.ticketEvent.findFirst({
    where: { id: eventId, ticketId },
    select: {
      id: true,
      type: true,
      body: true,
      actorId: true,
      actor: { select: { displayName: true } },
    },
  });
}

export type NoticeEvent = NonNullable<Awaited<ReturnType<typeof loadNoticeEvent>>>;

type CandidateRow = {
  id: string;
  organizationId: string;
  isActive: boolean;
  email: string;
  displayName: string;
  grants: NoticeCandidate["grants"];
  preference:
    | (NonNullable<Parameters<typeof emailPreferencesOf>[0]> & {
        emailRequestSent: boolean;
        emailBandSent: boolean;
      })
    | null;
};

function toCandidate(user: CandidateRow) {
  return {
    id: user.id,
    organizationId: user.organizationId,
    isActive: user.isActive,
    email: user.email,
    displayName: user.displayName,
    grants: user.grants,
    emailPreferences: emailPreferencesOf(user.preference),
    emailRequestSent: user.preference?.emailRequestSent ?? true,
    emailBandSent: user.preference?.emailBandSent ?? true,
  };
}

const candidateSelect = {
  id: true,
  organizationId: true,
  isActive: true,
  email: true,
  displayName: true,
  grants: { select: grantSelect },
  preference: { select: preferenceSelect },
} as const;

/** Every active account in the organization, with grants and email preferences. */
export async function loadCandidates(organizationId: string) {
  const users = await db.user.findMany({
    where: { organizationId, isActive: true },
    select: candidateSelect,
  });
  return users.map(toCandidate);
}

/** One account as a recipient (inactive accounts included, so callers can skip them). */
export async function loadCandidate(organizationId: string, userId: string) {
  const user = await db.user.findFirst({
    where: { id: userId, organizationId },
    select: candidateSelect,
  });
  return user ? toCandidate(user) : null;
}
