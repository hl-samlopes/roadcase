/** One path segment of a branding key: letters, digits, dots, dashes and underscores only. */
const SEGMENT = /^[A-Za-z0-9._-]+$/;

/** Whether a key is a branding file Roadcase could have stored (branding/<org>/<file>). */
export function isBrandingKey(key: string): boolean {
  const parts = key.split("/");
  return (
    parts[0] === "branding" &&
    parts.length >= 3 &&
    parts.slice(1).every((part) => SEGMENT.test(part) && part !== "." && part !== "..")
  );
}

/**
 * Public URL of a branding image (logos, favicon, backgrounds). With
 * S3_PUBLIC_BASE_URL set (MinIO in development, where only the branding/
 * prefix is public) it points at the bucket. Without it, it's Roadcase's own
 * /branding route, which serves only branding files, so the bucket can stay
 * fully private (Cloudflare R2 can only make a whole bucket public).
 */
export function brandingAssetUrl(
  key: string | null | undefined,
  env: { S3_PUBLIC_BASE_URL?: string } = process.env as { S3_PUBLIC_BASE_URL?: string },
): string | null {
  if (!key || !isBrandingKey(key)) return null;
  const base = env.S3_PUBLIC_BASE_URL?.trim();
  if (base) {
    return `${base.replace(/\/+$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
  return `/${key}`;
}
