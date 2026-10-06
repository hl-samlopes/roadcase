import "server-only";
import type { Prisma } from "@/generated/prisma/client.ts";
import { enqueue } from "@/lib/jobs/boss";
import type { TicketNotice } from "./recipients";

/**
 * Queues the notifications for a ticket event inside the transaction that
 * records it, so they go out only if the change is saved. The worker works
 * out who hears about it.
 */
export async function queueTicketNotice(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    ticketId: string;
    eventId: string;
    notice: TicketNotice;
    actorId: string | null;
  },
) {
  await enqueue("ticket.notify", input, { tx, key: input.eventId });
}
