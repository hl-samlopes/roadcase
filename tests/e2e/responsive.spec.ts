import { expect, test } from "@playwright/test";
import { accounts, existingTicket, items } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

const pages = [
  "/items",
  `/items/${items.hne.id}`,
  "/tickets?status=all",
  `/tickets/${existingTicket.id}`,
  "/service-log",
  "/settings/users",
];

test("main pages don't scroll sideways at phone width", async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await (
    await browser.newContext({ viewport: { width: 375, height: 812 } })
  ).newPage();
  await signIn(page, accounts.admin);
  for (const path of pages) {
    await page.goto(path);
    const width = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      screen: document.documentElement.clientWidth,
    }));
    expect(width.page, path).toBeLessThanOrEqual(width.screen);
  }
  // Wide tables still scroll inside their own box instead.
  await page.goto("/items");
  await expect(page.getByRole("columnheader", { name: "Department" })).toBeHidden();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`placeholder text meets 4.5:1 contrast in ${colorScheme} mode`, async ({ browser }) => {
    const page = await (await browser.newContext({ colorScheme })).newPage();
    await signIn(page, accounts.textSize);
    if (colorScheme === "dark") await page.emulateMedia({ colorScheme: "dark" });
    const ratio = await page.locator("#scan-code").evaluate((input) => {
      // Resolve both colors to sRGB through a canvas, whatever CSS color syntax they use.
      const toRgb = (css: string) => {
        const ctx = document.createElement("canvas").getContext("2d")!;
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      };
      const luminance = (rgb: number[]) => {
        const [r, g, b] = rgb.map((c) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const fg = luminance(toRgb(getComputedStyle(input, "::placeholder").color));
      const bg = luminance(toRgb(getComputedStyle(input).backgroundColor));
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
}
