import { getCurrentUser } from "@/lib/authz";
import { getCheckout } from "@/lib/data/checkouts";
import { db } from "@/lib/db";
import { getObjectStream } from "@/lib/storage";

/** The signed contract PDF, for anyone who can see the check-out. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/checkouts/[id]/contract.pdf">,
) {
  const user = await getCurrentUser();
  const checkout = user ? await getCheckout(user, (await params).id) : null;
  const contract = checkout
    ? await db.contract.findFirst({
        where: { checkoutId: checkout.id, voidedAt: null, signedAt: { not: null } },
        select: { pdfKey: true },
      })
    : null;
  if (!checkout || !contract?.pdfKey) return new Response("Not found", { status: 404 });

  const { body, contentLength } = await getObjectStream(contract.pdfKey);
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="contract-checkout-${checkout.number}.pdf"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
    },
  });
}
