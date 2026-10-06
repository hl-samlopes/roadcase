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

// Moved to ./request-labels; kept here until the pages import from there.
export { guestRequestStatusLabels, requestStatusLabels } from "./request-labels";
