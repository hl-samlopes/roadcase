/**
 * Absolute links for email and Slack, from APP_URL (the address people use to
 * reach Roadcase). Development falls back to the local dev server.
 */
export function appUrl(path: string, env = process.env): string {
  const base = env.APP_URL?.trim();
  if (!base && env.NODE_ENV === "production") throw new Error("APP_URL is not set");
  return new URL(path, base || "http://localhost:3000").href;
}
