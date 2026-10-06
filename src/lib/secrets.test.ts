import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, SecretsKeyError, secretsConfigured } from "./secrets";

const keyA = randomBytes(32).toString("base64");
const keyB = randomBytes(32).toString("base64");
const url = "https://hooks.slack.com/services/T000/B000/abcdefghijklmnop";

describe("secrets", () => {
  it("round-trips and never stores the plaintext", () => {
    const stored = encryptSecret(url, keyA);
    expect(stored.startsWith("v1.")).toBe(true);
    expect(stored).not.toContain("hooks.slack.com");
    expect(decryptSecret(stored, keyA)).toBe(url);
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret(url, keyA)).not.toBe(encryptSecret(url, keyA));
  });

  it("rejects the wrong key and tampered values", () => {
    const stored = encryptSecret(url, keyA);
    expect(() => decryptSecret(stored, keyB)).toThrow();
    const parts = stored.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), keyA)).toThrow();
    expect(() => decryptSecret("plain-text", keyA)).toThrow("Unrecognized");
  });

  it("requires a 32-byte key", () => {
    expect(secretsConfigured(keyA)).toBe(true);
    expect(secretsConfigured(undefined)).toBe(false);
    expect(secretsConfigured(randomBytes(16).toString("base64"))).toBe(false);
    expect(() => encryptSecret(url, "short")).toThrow(SecretsKeyError);
  });
});
