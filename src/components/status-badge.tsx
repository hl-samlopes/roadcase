import type {
  CheckoutStatus,
  EquipmentRequestStatus,
  TicketStatus,
} from "@/generated/prisma/enums.ts";
import type { PortalLinkStatus } from "@/lib/authz/portal-policy";
import { requestStatusLabels } from "@/lib/portal/request-labels";
import { checkoutStatusLabels, portalLinkStatusLabels, ticketStatusLabels } from "@/lib/labels";

/** Ticket status as text in an outlined badge; never color alone. */
export function StatusBadge({ status }: { status: TicketStatus }) {
  const closed = status === "COMPLETED" || status === "CANCELLED";
  return (
    <span
      className={`rounded-theme inline-block border px-1.5 whitespace-nowrap ${
        closed ? "border-border text-muted" : "border-accent text-text font-semibold"
      }`}
    >
      {ticketStatusLabels[status]}
    </span>
  );
}

/** Check-out status as text in an outlined badge; finished ones are muted. */
export function CheckoutStatusBadge({ status }: { status: CheckoutStatus }) {
  const closed = status === "RETURNED" || status === "CANCELLED";
  return (
    <span
      className={`rounded-theme inline-block border px-1.5 whitespace-nowrap ${
        closed ? "border-border text-muted" : "border-accent text-text font-semibold"
      }`}
    >
      {checkoutStatusLabels[status]}
    </span>
  );
}

/** A guest group's portal link as text in an outlined badge; only a working link stands out. */
export function PortalLinkBadge({ status }: { status: PortalLinkStatus | null }) {
  return (
    <span
      className={`rounded-theme inline-block border px-1.5 whitespace-nowrap ${
        status === "active" ? "border-accent text-text font-semibold" : "border-border text-muted"
      }`}
    >
      {status ? portalLinkStatusLabels[status] : "No link yet"}
    </span>
  );
}

/** An equipment request's status for staff; ones waiting for review stand out. */
export function RequestStatusBadge({ status }: { status: EquipmentRequestStatus }) {
  const waiting = status === "SUBMITTED" || status === "IN_REVIEW";
  return (
    <span
      className={`rounded-theme inline-block border px-1.5 whitespace-nowrap ${
        waiting ? "border-accent text-text font-semibold" : "border-border text-muted"
      }`}
    >
      {requestStatusLabels[status]}
    </span>
  );
}
