import { describe, expect, it } from "vitest";
import { checkUpload, cleanFileName, detectFileType, MAX_PHOTO_BYTES } from "./files";

const bytes = (...values: number[]) => new Uint8Array(values);
const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0);
const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0);
const webp = new Uint8Array([
  ...new TextEncoder().encode("RIFF"),
  0,
  0,
  0,
  0,
  ...new TextEncoder().encode("WEBPVP8 "),
]);
const pdf = new TextEncoder().encode("%PDF-1.7\n");
const html = new TextEncoder().encode("<html><script>alert(1)</script>");

describe("detectFileType", () => {
  it("recognizes allowed types by content", () => {
    expect(detectFileType(jpeg)?.contentType).toBe("image/jpeg");
    expect(detectFileType(png)?.contentType).toBe("image/png");
    expect(detectFileType(webp)?.contentType).toBe("image/webp");
    expect(detectFileType(pdf)).toEqual({
      contentType: "application/pdf",
      extension: "pdf",
      kind: "DOCUMENT",
    });
  });

  it("rejects anything else", () => {
    expect(detectFileType(html)).toBeNull();
    expect(detectFileType(bytes())).toBeNull();
  });
});

describe("checkUpload", () => {
  it("enforces photo-only uploads and size limits", () => {
    expect(checkUpload(pdf, { photoOnly: true }).ok).toBe(false);
    expect(checkUpload(jpeg, { photoOnly: true }).ok).toBe(true);
    const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
    big.set(jpeg);
    expect(checkUpload(big)).toEqual({ ok: false, error: "Images can be up to 10 MB." });
    expect(checkUpload(jpeg, { maxBytes: 4 })).toEqual({
      ok: false,
      error: "Images can be up to 0 KB.",
    });
    expect(checkUpload(bytes())).toEqual({ ok: false, error: "The file is empty." });
  });
});

describe("cleanFileName", () => {
  it("drops paths, quotes and control characters", () => {
    expect(cleanFileName('C:\\fakepath\\mixer"photo".jpg', "jpg")).toBe("mixerphoto.jpg");
    expect(cleanFileName("../../etc/passwd\u0000", "pdf")).toBe("passwd");
    expect(cleanFileName("", "pdf")).toBe("file.pdf");
  });
});
