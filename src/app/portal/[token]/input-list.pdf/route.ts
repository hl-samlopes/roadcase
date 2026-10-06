import { portalCan, resolvePortal } from "@/lib/authz";
import { db } from "@/lib/db";
import { getObjectStream } from "@/lib/storage";

/** The group's shared input list as a PDF, once the worker has made it. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/portal/[token]/input-list.pdf">,
) {
  const portal = await resolvePortal((await params).token);
  if (!portal || !portalCan(portal.principal, "portal:view", portal.principal)) {
    return new Response("Not found", { status: 404 });
  }
  const list = await db.inputList.findFirst({
    where: {
      guestGroupId: portal.principal.guestGroupId,
      organizationId: portal.principal.organizationId,
      sharedAt: { not: null },
    },
    select: { pdfKey: true, pdfVersion: true, version: true },
  });
  if (!list?.pdfKey || list.pdfVersion !== list.version) {
    return new Response("Not found", { status: 404 });
  }
  const { body, contentLength } = await getObjectStream(list.pdfKey);
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="input-list.pdf"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
    },
  });
}
