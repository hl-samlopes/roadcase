/**
 * Accepts only same-origin relative paths for post-sign-in redirects, so a
 * crafted link cannot send users to another site.
 */
export function safeCallbackUrl(value: unknown, fallback = "/items"): string {
  if (typeof value !== "string" || value.length > 2000) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
