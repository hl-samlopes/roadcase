import "server-only";
import { randomUUID } from "node:crypto";
import { checkUpload, cleanFileName, type DetectedFile } from "@/lib/files";
import { putObject } from "@/lib/storage";

export interface CheckedUpload {
  ok: true;
  bytes: Uint8Array;
  detected: DetectedFile;
  fileName: string;
}

/** Reads and checks an uploaded file; null when no file was chosen. */
export async function readUpload(
  formData: FormData,
  name: string,
  options: { photoOnly?: boolean } = {},
): Promise<CheckedUpload | { ok: false; error: string } | null> {
  const file = formData.get(name);
  if (!(file instanceof File) || file.size === 0) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkUpload(bytes, options);
  return check.ok
    ? {
        ok: true,
        bytes,
        detected: check.file,
        fileName: cleanFileName(file.name, check.file.extension),
      }
    : { ok: false, error: check.error };
}

/** Stores a checked upload under a random key and returns attachment fields. */
export async function storeUpload(organizationId: string, upload: CheckedUpload) {
  const storageKey = `attachments/${organizationId}/${randomUUID()}.${upload.detected.extension}`;
  await putObject(storageKey, upload.bytes, upload.detected.contentType);
  return {
    organizationId,
    storageKey,
    kind: upload.detected.kind,
    fileName: upload.fileName,
    contentType: upload.detected.contentType,
    sizeBytes: upload.bytes.length,
  };
}
