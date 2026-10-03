/**
 * Upload rules. File types are decided from the file's first bytes, never from
 * the name or the browser-reported type.
 */

export type DetectedFile = {
  contentType: string;
  extension: string;
  kind: "PHOTO" | "DOCUMENT";
};

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export const acceptedUploadTypes = "image/jpeg,image/png,image/webp,application/pdf";

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export function detectFileType(bytes: Uint8Array): DetectedFile | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { contentType: "image/jpeg", extension: "jpg", kind: "PHOTO" };
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: "image/png", extension: "png", kind: "PHOTO" };
  }
  // "RIFF" .... "WEBP"
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { contentType: "image/webp", extension: "webp", kind: "PHOTO" };
  }
  // "%PDF-"
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { contentType: "application/pdf", extension: "pdf", kind: "DOCUMENT" };
  }
  return null;
}

export type UploadCheck = { ok: true; file: DetectedFile } | { ok: false; error: string };

export function checkUpload(bytes: Uint8Array, options: { photoOnly?: boolean } = {}): UploadCheck {
  if (bytes.length === 0) return { ok: false, error: "The file is empty." };
  const file = detectFileType(bytes);
  if (!file || (options.photoOnly && file.kind !== "PHOTO")) {
    return {
      ok: false,
      error: options.photoOnly
        ? "Photos must be JPEG, PNG or WebP images."
        : "Upload a JPEG, PNG or WebP photo, or a PDF document.",
    };
  }
  const limit = file.kind === "PHOTO" ? MAX_PHOTO_BYTES : MAX_DOCUMENT_BYTES;
  if (bytes.length > limit) {
    return {
      ok: false,
      error: `${file.kind === "PHOTO" ? "Photos" : "Documents"} can be up to ${limit / 1024 / 1024} MB.`,
    };
  }
  return { ok: true, file };
}

/** A display file name with no path parts or control characters. */
export function cleanFileName(name: string, fallbackExtension: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f"]/g, "")
    .trim()
    .slice(0, 200);
  return cleaned || `file.${fallbackExtension}`;
}
