import "server-only";
import { buildHistory } from "@/lib/checkouts/history";
import { db } from "@/lib/db";

/** Loads a check-out's history (the caller has already checked it may be read). */
export async function checkoutHistory(organizationId: string, checkoutId: string) {
  const checkout = await db.checkout.findFirst({
    where: { id: checkoutId, organizationId },
    select: {
      createdAt: true,
      cancelledAt: true,
      returnedAt: true,
      createdBy: { select: { displayName: true } },
      contracts: {
        orderBy: { preparedAt: "asc" },
        select: {
          preparedAt: true,
          voidedAt: true,
          signedAt: true,
          preparedBy: { select: { displayName: true } },
          signatures: { select: { role: true, printedName: true, signedAt: true } },
        },
      },
      lines: {
        where: { returnedAt: { not: null } },
        select: {
          returnedAt: true,
          returnNotes: true,
          returnedBy: { select: { displayName: true } },
          returnCondition: { select: { label: true } },
          item: { select: { code: true, name: true } },
        },
      },
      tickets: {
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, number: true, title: true, item: { select: { code: true } } },
      },
    },
  });
  if (!checkout) return [];
  return buildHistory({
    createdAt: checkout.createdAt,
    createdBy: checkout.createdBy?.displayName ?? null,
    cancelledAt: checkout.cancelledAt,
    returnedAt: checkout.returnedAt,
    contracts: checkout.contracts.map((c) => ({
      preparedAt: c.preparedAt,
      preparedBy: c.preparedBy?.displayName ?? null,
      voidedAt: c.voidedAt,
      signedAt: c.signedAt,
      signatures: c.signatures,
    })),
    returns: checkout.lines.map((line) => ({
      returnedAt: line.returnedAt!,
      returnedBy: line.returnedBy?.displayName ?? null,
      code: line.item.code,
      name: line.item.name,
      condition: line.returnCondition?.label ?? "condition not recorded",
      notes: line.returnNotes,
    })),
    tickets: checkout.tickets.map((t) => ({
      createdAt: t.createdAt,
      number: t.number,
      code: t.item.code,
      title: t.title,
    })),
  });
}
