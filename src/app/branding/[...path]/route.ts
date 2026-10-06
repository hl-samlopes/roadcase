import { isBrandingKey } from "@/lib/branding-url";
import { getObjectStream } from "@/lib/storage";

/**
 * Public organization branding files (logos, favicon, backgrounds), for when
 * the bucket itself is private. Serves keys under branding/ only; each
 * upload gets a new key, so files can be cached for a long time.
 */
export async function GET(_request: Request, { params }: RouteContext<"/branding/[...path]">) {
  const key = ["branding", ...(await params).path].join("/");
  if (!isBrandingKey(key)) return new Response("Not found", { status: 404 });
  try {
    const { body, contentLength, contentType } = await getObjectStream(key);
    return new Response(body, {
      headers: {
        "Content-Type": contentType ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=31536000, immutable",
        ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
