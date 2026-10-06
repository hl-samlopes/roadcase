import type { EquipmentRequestStatus } from "@/generated/prisma/enums.ts";

/** Statuses in which the group can still change its request (staff haven't started). */
export const guestEditableStatuses: EquipmentRequestStatus[] = ["DRAFT", "SUBMITTED", "WITHDRAWN"];

export function guestCanEdit(status: EquipmentRequestStatus | null): boolean {
  return status === null || guestEditableStatuses.includes(status);
}

/** Statuses whose approved quantities hold items for the group's dates. */
export const reservingStatuses: EquipmentRequestStatus[] = ["APPROVED", "PARTLY_APPROVED"];

/** How the request's status reads to the group in the portal. */
export const guestRequestStatusLabels: Record<EquipmentRequestStatus, string> = {
  DRAFT: "Saved, not sent yet",
  SUBMITTED: "Sent: waiting for staff",
  IN_REVIEW: "Staff are reviewing it",
  APPROVED: "Approved",
  PARTLY_APPROVED: "Partly approved",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
};

/** How the request's status reads to staff. */
export const requestStatusLabels: Record<EquipmentRequestStatus, string> = {
  DRAFT: "Draft (not sent)",
  SUBMITTED: "Submitted",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  PARTLY_APPROVED: "Partly approved",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
};
