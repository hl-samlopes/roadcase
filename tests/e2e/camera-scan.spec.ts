import { expect, test } from "@playwright/test";
import { accounts, items } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

// There's no camera in a test browser: stand in for the browser's barcode
// reader (always "sees" one code) and the camera (a blank canvas stream).
function fakeCamera(code: string) {
  return `
    window.BarcodeDetector = class {
      static async getSupportedFormats() { return ["code_128", "qr_code"]; }
      async detect() { return [{ rawValue: ${JSON.stringify(code)} }]; }
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      setInterval(() => { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 64, 64); }, 50);
      return canvas.captureStream(20);
    };
  `;
}

test("a phone camera reads an item's barcode and opens the item", async ({ page }) => {
  await page.addInitScript(fakeCamera(items.hlk.code.toLowerCase()));
  await signIn(page, accounts.admin);
  await page.goto("/service-log");
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: items.hlk.name })).toBeVisible();
});

test("no camera button where the browser can't read barcodes", async ({ page }) => {
  await page.addInitScript("delete window.BarcodeDetector;");
  await signIn(page, accounts.admin);
  await page.goto("/service-log");
  await expect(page.getByLabel("Scan or enter an item code")).toBeVisible();
  await expect(page.getByRole("button", { name: "Camera", exact: true })).toHaveCount(0);
});
