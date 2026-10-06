import { z } from "zod";
import { can, checkoutScope, getCurrentUser } from "@/lib/authz";
import { getCheckout } from "@/lib/data/checkouts";
import { db } from "@/lib/db";
import { getObjectStream } from "@/lib/storage";

/** A raw signature image: admins over the check-out's campus only. Never cached. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/checkouts/[id]/signatures/[signatureId]">,
) {
  const { id, signatureId } = await params;
  const user = await getCurrentUser();
  const checkout = user ? await getCheckout(user, id) : null;
  if (!user || !checkout || !can(user, "checkout:audit", checkoutScope(checkout))) {
    return new Response("Not found", { status: 404 });
  }
  if (!z.uuid().safeParse(signatureId).success) return new Response("Not found", { status: 404 });
  const signature = await db.contractSignature.findFirst({
    where: { id: signatureId, contract: { checkoutId: checkout.id } },
    select: { imageKey: true },
  });
  if (!signature) return new Response("Not found", { status: 404 });

  const { body, contentLength } = await getObjectStream(signature.imageKey);
  return new Response(body, {
    headers: {
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
    },
  });
}
