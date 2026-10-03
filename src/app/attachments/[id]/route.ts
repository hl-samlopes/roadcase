import { getCurrentUser } from "@/lib/authz";
import { getReadableAttachment } from "@/lib/data/attachments";
import { getObjectStream } from "@/lib/storage";

/** Streams an attachment after checking the signed-in user may read its record. */
export async function GET(request: Request, { params }: RouteContext<"/attachments/[id]">) {
  const user = await getCurrentUser();
  const attachment = user ? await getReadableAttachment(user, (await params).id) : null;
  if (!attachment) return new Response("Not found", { status: 404 });

  const { body, contentLength } = await getObjectStream(attachment.storageKey);
  const download = new URL(request.url).searchParams.has("download");
  const disposition = `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`;

  return new Response(body, {
    headers: {
      "Content-Type": attachment.contentType,
      "Content-Disposition": disposition,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
      ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
    },
  });
}
