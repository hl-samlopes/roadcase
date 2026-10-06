import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * Private S3-compatible storage for attachments (MinIO in development).
 * Files are only served through routes that check permissions first.
 */
let client: S3Client | undefined;

function s3() {
  client ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
  return client;
}

function bucket() {
  const name = process.env.S3_BUCKET;
  if (!name) throw new Error("S3_BUCKET is not set");
  return name;
}

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  await s3().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

export async function getObjectStream(key: string) {
  const result = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!result.Body) throw new Error("Empty object body");
  return {
    body: result.Body.transformToWebStream(),
    contentLength: result.ContentLength,
    contentType: result.ContentType,
  };
}

/** Reads a whole object into memory; for small files such as signatures and contract PDFs. */
export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const result = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!result.Body) throw new Error("Empty object body");
  return result.Body.transformToByteArray();
}

export async function deleteObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
