import { createHash } from "node:crypto";

/**
 * Pure helpers for e-signatures: what signers agree to, the hash of the text
 * they saw, and checks on the drawn signature image.
 */

/** Shown next to the checkbox and stored with each signature, word for word. */
export const SIGNATURE_CONSENT =
  "I have read this contract. I agree to sign it electronically, and my electronic signature has the same effect as my handwritten signature.";

export const signerRoleLabels = {
  GUEST: "Guest representative",
  STAFF: "Staff representative",
} as const;

/** UTC, to the second, so times read the same everywhere and match the audit trail. */
export function utcStamp(date: Date): string {
  return `${date.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Large enough for a detailed signature at tablet resolution; small enough to store and email. */
export const MAX_SIGNATURE_BYTES = 400_000;
/** A blank canvas is a few hundred bytes; anything this small has no real strokes. */
const MIN_SIGNATURE_BYTES = 600;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Decodes the canvas's data URL; only a PNG of plausible size is accepted. */
export function parseSignatureImage(
  dataUrl: string,
): { ok: true; bytes: Uint8Array } | { ok: false; error: string } {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) return { ok: false, error: "Draw your signature in the box." };
  const base64 = dataUrl.slice(prefix.length);
  if (base64.length > Math.ceil((MAX_SIGNATURE_BYTES * 4) / 3) + 4) {
    return { ok: false, error: "That signature image is too large. Clear it and sign again." };
  }
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  if (!PNG_MAGIC.every((byte, i) => bytes[i] === byte)) {
    return { ok: false, error: "Draw your signature in the box." };
  }
  if (bytes.length < MIN_SIGNATURE_BYTES) {
    return { ok: false, error: "The signature box is empty. Draw your signature." };
  }
  return { ok: true, bytes };
}

/**
 * The client's IP address from proxy headers: the first X-Forwarded-For entry
 * (set by the hosting proxy), else X-Real-IP. Trimmed and length-capped.
 */
export function clientIp(headers: { get(name: string): string | null }): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim() || null;
  return ip ? ip.slice(0, 64) : null;
}
