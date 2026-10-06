import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption for secrets kept in the database (Slack webhook URLs now,
 * MaintainX keys later): AES-256-GCM with a key from SECRETS_ENCRYPTION_KEY
 * (32 random bytes, base64; `openssl rand -base64 32`). Stored values look
 * like "v1.<iv>.<tag>.<ciphertext>", so a future key or algorithm can be told
 * apart. Never log a decrypted value.
 */

const VERSION = "v1";

export class SecretsKeyError extends Error {
  constructor() {
    super("SECRETS_ENCRYPTION_KEY is missing or isn't 32 bytes of base64");
    this.name = "SecretsKeyError";
  }
}

function key(raw = process.env.SECRETS_ENCRYPTION_KEY): Buffer {
  const bytes = raw ? Buffer.from(raw.trim(), "base64") : Buffer.alloc(0);
  if (bytes.length !== 32) throw new SecretsKeyError();
  return bytes;
}

/** Whether secrets can be stored right now (the key is set and valid). */
export function secretsConfigured(raw = process.env.SECRETS_ENCRYPTION_KEY): boolean {
  try {
    key(raw);
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string, raw?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(raw), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function decryptSecret(stored: string, raw?: string): string {
  const [version, iv, tag, ciphertext] = stored.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error("Unrecognized encrypted value");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(raw), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
