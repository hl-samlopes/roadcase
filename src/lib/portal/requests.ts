import type { EquipmentRequestStatus } from "@/generated/prisma/enums.ts";
import { can, type Actor } from "@/lib/authz/policy";

/** Statuses in which the group can still change its request (staff haven't started). */
export const guestEditableStatuses: EquipmentRequestStatus[] = ["DRAFT", "SUBMITTED", "WITHDRAWN"];

export function guestCanEdit(status: EquipmentRequestStatus | null): boolean {
  return status === null || guestEditableStatuses.includes(status);
}

/** Statuses whose approved quantities hold items for the group's dates. */
export const reservingStatuses: EquipmentRequestStatus[] = ["APPROVED", "PARTLY_APPROVED"];

/** Statuses staff work on: sent and not yet decided. */
export const waitingStatuses: EquipmentRequestStatus[] = ["SUBMITTED", "IN_REVIEW"];

/** Statuses with a decision the group has been told about. */
export const decidedStatuses: EquipmentRequestStatus[] = [
  "APPROVED",
  "PARTLY_APPROVED",
  "DECLINED",
];

/**
 * The request's status from staff's decisions: everything asked for (or
 * more) is Approved, nothing is Declined, anything in between is Partly
 * approved.
 */
export function decisionStatus(
  lines: { quantityRequested: number; quantityApproved: number }[],
): "APPROVED" | "PARTLY_APPROVED" | "DECLINED" {
  if (lines.every((line) => line.quantityApproved === 0)) return "DECLINED";
  if (lines.every((line) => line.quantityApproved >= line.quantityRequested)) return "APPROVED";
  return "PARTLY_APPROVED";
}

/**
 * Whether someone should be emailed that a group sent a request: they run
 * check-outs at its campus (so they can review it) and haven't turned these
 * emails off. Checked when queued and again when sent.
 */
export function isRequestApprover(
  candidate: Actor & { emailRequestSent: boolean },
  request: { organizationId: string; campusId: string },
): boolean {
  return (
    candidate.isActive &&
    candidate.organizationId === request.organizationId &&
    candidate.emailRequestSent &&
    can(candidate, "checkout:manage", {
      organizationId: request.organizationId,
      campusId: request.campusId,
    })
  );
}

/**
 * Whether someone should be emailed that a group sent its band setup: the
 * same people as for requests (they run check-outs at the campus), with
 * their own switch in Preferences.
 */
export function isBandRecipient(
  candidate: Actor & { emailBandSent: boolean },
  place: { organizationId: string; campusId: string },
): boolean {
  return (
    candidate.isActive &&
    candidate.organizationId === place.organizationId &&
    candidate.emailBandSent &&
    can(candidate, "checkout:manage", {
      organizationId: place.organizationId,
      campusId: place.campusId,
    })
  );
}

type NoticeCandidate = Actor & { emailRequestSent: boolean; emailBandSent: boolean };

/**
 * Who hears that a group sent a request or band setup. The campus's default
 * contact alone, while they run check-outs there and want these emails;
 * otherwise (none set, or they turned it off) everyone who runs check-outs
 * at the campus and wants them.
 */
export function campusNoticeRecipients<C extends NoticeCandidate>(
  candidates: C[],
  place: { organizationId: string; campusId: string; defaultContactId: string | null },
  kind: "request" | "band",
): C[] {
  const wants = (candidate: C) =>
    kind === "request" ? isRequestApprover(candidate, place) : isBandRecipient(candidate, place);
  const contact = candidates.find((candidate) => candidate.id === place.defaultContactId);
  if (contact && wants(contact)) return [contact];
  return candidates.filter(wants);
}
