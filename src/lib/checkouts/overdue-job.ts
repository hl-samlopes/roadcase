import "server-only";
import { z } from "zod";
import { appUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import type { EmailContent } from "@/lib/email/layout";
import { formatDate } from "@/lib/format";
import { enqueue } from "@/lib/jobs/boss";
import { appTimeZone, dateInZone, daysOverdue, remindToday } from "./overdue";

/**
 * Finds check-outs that are overdue today and queues a reminder to each one's
 * staff representative (first overdue day, then weekly). Keyed per check-out
 * and day, so running it every hour, or on several workers, sends one email.
 */
export async function remindOverdueCheckouts(now = new Date()) {
  const today = dateInZone(now, appTimeZone());
  const candidates = await db.checkout.findMany({
    where: {
      status: { in: ["OUT", "PARTIALLY_RETURNED"] },
      dateDue: { lt: new Date(`${today}T00:00:00Z`) },
      staffRepId: { not: null },
    },
    select: { id: true, organizationId: true, status: true, dateDue: true, staffRepId: true },
  });
  let queued = 0;
  for (const checkout of candidates) {
    if (!remindToday(daysOverdue(checkout, today))) continue;
    const key = `overdue:${checkout.id}:${today}`;
    const id = await enqueue(
      "email.send",
      {
        organizationId: checkout.organizationId,
        idempotencyKey: key,
        recipient: { userId: checkout.staffRepId! },
        template: "overdue",
        data: { checkoutId: checkout.id },
      },
      { key },
    );
    if (id) queued += 1;
  }
  return queued;
}

const MAX_ITEMS_LISTED = 20;

/** The reminder itself, worked out when it's sent: nothing goes out if the items came back. */
export async function overdueEmail(
  organizationId: string,
  checkoutId: string,
): Promise<{ content: EmailContent; campusId: string } | { skip: string }> {
  if (!z.uuid().safeParse(checkoutId).success) return { skip: "no check-out id" };
  const checkout = await db.checkout.findFirst({
    where: { id: checkoutId, organizationId },
    select: {
      id: true,
      campusId: true,
      number: true,
      status: true,
      groupName: true,
      guestRepName: true,
      guestRepEmail: true,
      guestRepPhone: true,
      dateDue: true,
      campus: { select: { name: true } },
      lines: {
        where: { returnedAt: null },
        orderBy: { createdAt: "asc" },
        select: { item: { select: { code: true, name: true } } },
      },
    },
  });
  if (!checkout) return { skip: "check-out no longer exists" };
  const days = daysOverdue(checkout, dateInZone(new Date(), appTimeZone()));
  if (days === 0 || checkout.lines.length === 0) return { skip: "no longer overdue" };

  const listed = checkout.lines.slice(0, MAX_ITEMS_LISTED);
  const more = checkout.lines.length - listed.length;
  return {
    campusId: checkout.campusId,
    content: {
      subject: `Overdue: check-out #${checkout.number} (${checkout.groupName}), due back ${formatDate(checkout.dateDue)}`,
      heading: "Equipment is overdue",
      paragraphs: [
        `${checkout.groupName}'s check-out #${checkout.number} from ${checkout.campus.name} was due back on ${formatDate(checkout.dateDue)}, ${days} day${days === 1 ? "" : "s"} ago. Not back yet:`,
        ...listed.map((line) => `${line.item.code} ${line.item.name}`),
        ...(more > 0 ? [`and ${more} more`] : []),
        `Guest representative: ${checkout.guestRepName}, ${checkout.guestRepEmail}, ${checkout.guestRepPhone}.`,
      ],
      action: {
        label: `Open check-out #${checkout.number}`,
        url: appUrl(`/checkouts/${checkout.id}`),
      },
      footer:
        "You're getting this because you're the staff representative. It repeats weekly until everything is back.",
    },
  };
}
