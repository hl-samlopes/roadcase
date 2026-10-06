import type { EquipmentRequestStatus } from "@/generated/prisma/enums.ts";

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
