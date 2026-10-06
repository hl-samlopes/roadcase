import { createHash, randomBytes } from "node:crypto";

/**
 * Portal link tokens: 32 random bytes as base64url (43 characters), carried
 * in the path (/portal/<token>), never in a query string. Only the SHA-256
 * is stored. Never log a token.
 */

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function newPortalToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPortalToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Whether a path segment could be a token at all (checked before any lookup). */
export function isPortalTokenShape(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export function portalPath(token: string): string {
  return `/portal/${token}`;
}
