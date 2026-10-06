import { db } from "@/lib/db";

// Checked live on every request, never at build time.
export const dynamic = "force-dynamic";

/** For the host's health check: the app is up and can reach its database. No details. */
export async function GET() {
  try {
    await db.$queryRaw`select 1`;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
