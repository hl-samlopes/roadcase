import type { TicketStatus } from "@/generated/prisma/enums.ts";
import { ticketStatusLabels } from "@/lib/labels";

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
