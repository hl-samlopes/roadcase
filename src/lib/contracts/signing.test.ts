import { describe, expect, it } from "vitest";
import { pngBytes } from "@/test-support/png";
import { clientIp, parseSignatureImage, sha256Hex } from "./signing";

const png = (size?: number) =>
  `data:image/png;base64,${Buffer.from(pngBytes(size)).toString("base64")}`;

describe("parseSignatureImage", () => {
  it("accepts a PNG with strokes", () => {
    const result = parseSignatureImage(png());
    expect(result.ok).toBe(true);
  });

  it("refuses other formats, blank canvases and huge images", () => {
    expect(parseSignatureImage("data:image/svg+xml;base64,PHN2Zz4=").ok).toBe(false);
    expect(
      parseSignatureImage(`data:image/png;base64,${Buffer.from("GIF89a").toString("base64")}`).ok,
    ).toBe(false);
    expect(parseSignatureImage(png(50)).ok).toBe(false);
    expect(parseSignatureImage(png(600_000)).ok).toBe(false);
  });
});

describe("sha256Hex", () => {
  it("hashes the exact text", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex("abc ")).not.toBe(sha256Hex("abc"));
  });
});

describe("clientIp", () => {
  const headers = (values: Record<string, string>) => ({
    get: (name: string) => values[name] ?? null,
  });
  it("uses the first forwarded address, then X-Real-IP", () => {
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(headers({}))).toBeNull();
  });
});
