import { getCurrentUser } from "@/lib/authz";
import { staffBand } from "@/lib/data/band";
import { db } from "@/lib/db";
import { getObjectStream } from "@/lib/storage";

/** A group's shared input list PDF, for staff who can see the group. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/guests/[id]/input-list.pdf">,
) {
  const user = await getCurrentUser();
  const band = user ? await staffBand(user, (await params).id) : null;
  if (!band?.list?.sharedAt || !band.list.pdfReady) {
    return new Response("Not found", { status: 404 });
  }
  const list = await db.inputList.findUnique({
    where: { id: band.list.id },
    select: { pdfKey: true },
  });
  if (!list?.pdfKey) return new Response("Not found", { status: 404 });
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
