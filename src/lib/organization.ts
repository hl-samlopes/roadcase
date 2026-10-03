import "server-only";
import { db } from "@/lib/db";

/**
 * Finds the organization a signed-out visitor belongs to: a subdomain matching
 * an organization slug, then DEFAULT_ORGANIZATION_SLUG, then the only
 * organization if there is just one. Step 3 extends this for branded sign-in.
 */
export async function resolveOrganization(host: string | null) {
  const hostname = host?.split(":")[0] ?? "";
  const labels = hostname.split(".");
  if (labels.length > 2 || (labels.length === 2 && labels[1] === "localhost")) {
    const bySubdomain = await db.organization.findUnique({ where: { slug: labels[0] } });
    if (bySubdomain) return bySubdomain;
  }

  const defaultSlug = process.env.DEFAULT_ORGANIZATION_SLUG;
  if (defaultSlug) return db.organization.findUnique({ where: { slug: defaultSlug } });

  const first = await db.organization.findMany({ take: 2, orderBy: { createdAt: "asc" } });
  return first.length === 1 ? first[0] : null;
}
