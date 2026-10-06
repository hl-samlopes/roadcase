import { z } from "zod";
import { portalCan, resolvePortal } from "@/lib/authz";
import { portalPhoto } from "@/lib/data/portal";
import { getObjectStream } from "@/lib/storage";

/**
 * An item photo for the portal catalog. Only the main photo of an item the
 * group could request (its campus, a portal category, a condition that can
 * go out); anything else is the same 404.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/portal/[token]/photos/[id]">,
) {
  const { token, id } = await params;
  const portal = await resolvePortal(token);
  const photo =
    portal &&
    portalCan(portal.principal, "catalog:read", portal.principal) &&
    z.uuid().safeParse(id).success
      ? await portalPhoto(portal.principal, id)
      : null;
  if (!photo || !photo.contentType.startsWith("image/")) {
    return new Response("Not found", { status: 404 });
  }
  const { body, contentLength } = await getObjectStream(photo.storageKey);
  return new Response(body, {
    headers: {
      "Content-Type": photo.contentType,
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
      ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
    },
  });
}
