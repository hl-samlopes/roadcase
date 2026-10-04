import { expect, test } from "@playwright/test";
import { accounts, existingTicket, items } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

// Duplicate ids break label/field links for screen readers and voice control.
const pages = [
  "/items",
  `/items/${items.hne.id}`,
  `/items/${items.hne.id}/edit`,
  "/items/new",
  "/tickets",
  `/tickets/${existingTicket.id}`,
  `/tickets/new?item=${items.desk.id}`,
  "/service-log",
  "/settings/users",
  "/settings/users/new",
  "/settings/locations",
  "/settings/fields",
  "/settings/conditions",
  "/account/preferences",
  "/account/password",
];

test("main pages have no duplicate element ids", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, accounts.admin);
  for (const path of pages) {
    await page.goto(path);
    const duplicates = await page.evaluate(() => {
      const seen = new Map<string, number>();
      for (const el of document.querySelectorAll("[id]"))
        seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
      return [...seen].filter(([, count]) => count > 1).map(([id]) => id);
    });
    expect(duplicates, path).toEqual([]);
  }
});
