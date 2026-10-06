import "server-only";
import { db } from "@/lib/db";
import { queueTicketNotice } from "@/lib/notifications/queue";
import { createTicket, findOpenTicket } from "./tickets";

export interface CheckInEntry {
  lineId: string;
  conditionId: string;
  notes: string | null;
}

export interface CheckInResult {
  error: string | null;
  returned: number;
  /** Tickets opened (or commented on) because an item came back needing repair. */
  tickets: { number: number; code: string; opened: boolean }[];
  status: "PARTIALLY_RETURNED" | "RETURNED" | null;
}

class CheckInRefused extends Error {}

/**
 * Checks items back in on a check-out that's out. Each returned line gets its
 * condition and notes, the item takes that condition, and the line stops
 * holding the item. A condition that starts a repair ticket opens one for that
 * item (linked to the check-out, with the return notes), or comments on the
 * item's open ticket. The check-out becomes Partially returned or Returned.
 */
export async function checkInLines(
  actorId: string,
  checkout: { id: string; organizationId: string; number: number; groupName: string },
  entries: CheckInEntry[],
): Promise<CheckInResult> {
  const empty = { returned: 0, tickets: [], status: null };
  if (entries.length === 0) return { error: "Choose at least one item to check in.", ...empty };

  const conditions = new Map(
    (
      await db.itemCondition.findMany({
        where: { organizationId: checkout.organizationId, archivedAt: null },
        select: { id: true, label: true, startsRepairTicket: true },
      })
    ).map((c) => [c.id, c]),
  );
  if (entries.some((entry) => !conditions.has(entry.conditionId))) {
    return { error: "Choose a condition for each item you're checking in.", ...empty };
  }

  try {
    return await db.$transaction(async (tx) => {
      const tickets: CheckInResult["tickets"] = [];
      const now = new Date();
      for (const entry of entries) {
        const line = await tx.checkoutLine.findFirst({
          where: { id: entry.lineId, checkoutId: checkout.id, returnedAt: null },
          select: {
            id: true,
            item: {
              select: {
                id: true,
                code: true,
                organizationId: true,
                campusId: true,
                locationId: true,
                departmentId: true,
              },
            },
          },
        });
        if (!line)
          throw new CheckInRefused(
            "One of those items was already checked in. Reload and try again.",
          );
        const condition = conditions.get(entry.conditionId)!;

        const marked = await tx.checkoutLine.updateMany({
          where: { id: line.id, returnedAt: null },
          data: {
            returnedAt: now,
            returnConditionId: condition.id,
            returnNotes: entry.notes,
            returnedById: actorId,
            holdsItem: false,
          },
        });
        if (marked.count !== 1) {
          throw new CheckInRefused(
            "One of those items was already checked in. Reload and try again.",
          );
        }
        await tx.item.update({
          where: { id: line.item.id },
          data: { conditionId: condition.id, updatedById: actorId },
        });

        if (!condition.startsRepairTicket) continue;
        const where = `on return from check-out #${checkout.number} (${checkout.groupName})`;
        const open = await findOpenTicket(tx, line.item.id);
        if (!open) {
          const ticket = await createTicket(tx, {
            item: line.item,
            title: `${condition.label} ${where}`,
            description: entry.notes,
            reporterId: actorId,
            checkoutId: checkout.id,
          });
          tickets.push({ number: ticket.number, code: line.item.code, opened: true });
        } else {
          const event = await tx.ticketEvent.create({
            data: {
              ticketId: open.id,
              actorId,
              type: "COMMENT",
              body: `Came back as ${condition.label} ${where}.${entry.notes ? ` Notes: ${entry.notes}` : ""}`,
            },
            select: { id: true },
          });
          await tx.serviceTicket.update({ where: { id: open.id }, data: { updatedAt: now } });
          await queueTicketNotice(tx, {
            organizationId: checkout.organizationId,
            ticketId: open.id,
            eventId: event.id,
            notice: "comment",
            actorId,
          });
          tickets.push({ number: open.number, code: line.item.code, opened: false });
        }
      }

      const outstanding = await tx.checkoutLine.count({
        where: { checkoutId: checkout.id, returnedAt: null },
      });
      const status = outstanding === 0 ? "RETURNED" : "PARTIALLY_RETURNED";
      const moved = await tx.checkout.updateMany({
        where: { id: checkout.id, status: { in: ["OUT", "PARTIALLY_RETURNED"] } },
        data: { status, returnedAt: outstanding === 0 ? now : null },
      });
      if (moved.count !== 1) throw new CheckInRefused("This check-out isn't out.");
      return { error: null, returned: entries.length, tickets, status };
    });
  } catch (error) {
    if (error instanceof CheckInRefused) return { error: error.message, ...empty };
    throw error;
  }
}
