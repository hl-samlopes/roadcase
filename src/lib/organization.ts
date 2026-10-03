import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

/** Slug from a subdomain such as hume.roadcase.example or hume.localhost. */
export function subdomainSlug(host: string | null): string | null {
  const hostname = (host ?? "").split(":")[0].toLowerCase();
  const labels = hostname.split(".");
  if (labels.length > 2 || (labels.length === 2 && labels[1] === "localhost")) {
    return labels[0] || null;
  }
  return null;
}

/**
 * Finds the organization for a signed-out visitor, so the sign-in page can
 * show its branding: the slug in the path (/sign-in/<slug>), then a matching
 * subdomain, then DEFAULT_ORGANIZATION_SLUG, then the only organization if
 * there is just one.
 */
export const resolveOrganization = cache(async (host: string | null, pathSlug?: string) => {
  if (pathSlug !== undefined) {
    return db.organization.findUnique({ where: { slug: pathSlug.toLowerCase() } });
  }

  const fromHost = subdomainSlug(host);
  if (fromHost) {
    const organization = await db.organization.findUnique({ where: { slug: fromHost } });
    if (organization) return organization;
  }

  const defaultSlug = process.env.DEFAULT_ORGANIZATION_SLUG;
  if (defaultSlug) return db.organization.findUnique({ where: { slug: defaultSlug } });

  const first = await db.organization.findMany({ take: 2, orderBy: { createdAt: "asc" } });
  return first.length === 1 ? first[0] : null;
});
