import { describe, expect, it } from "vitest";
import { brandingAssetUrl, isBrandingKey } from "./branding-url";

const key = "branding/0190a000-0000-7000-8000-000000000001/logo-light-abc.png";

describe("brandingAssetUrl", () => {
  it("points at the public bucket when one is set", () => {
    expect(brandingAssetUrl(key, { S3_PUBLIC_BASE_URL: "http://localhost:9000/roadcase/" })).toBe(
      `http://localhost:9000/roadcase/${key}`,
    );
  });

  it("points at Roadcase's own route otherwise, so the bucket stays private", () => {
    expect(brandingAssetUrl(key, {})).toBe(`/${key}`);
  });

  it("never makes a URL for anything outside branding/", () => {
    expect(brandingAssetUrl("items/abc/photo.png", {})).toBeNull();
    expect(brandingAssetUrl(null, {})).toBeNull();
  });
});

describe("isBrandingKey", () => {
  it("accepts stored branding keys only", () => {
    expect(isBrandingKey(key)).toBe(true);
    expect(isBrandingKey("branding/../items/x.png")).toBe(false);
    expect(isBrandingKey("branding/org/../../secret")).toBe(false);
    expect(isBrandingKey("branding/logo.png")).toBe(false);
    expect(isBrandingKey("contracts/org/x.pdf")).toBe(false);
  });
});
