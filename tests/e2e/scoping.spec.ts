import { expect, test } from "@playwright/test";
import { accounts, items } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

test.describe("an editor scoped to Meadow Ranch", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, accounts.meadowRanchEditor);
  });

  test("sees only Meadow Ranch equipment in the list", async ({ page }) => {
    await expect(page.getByRole("link", { name: items.hlk.name })).toBeVisible();
    await expect(page.getByText(items.hne.code)).toHaveCount(0);
  });

  test("can open a Meadow Ranch item", async ({ page }) => {
    await page.goto(`/items/${items.hlk.id}`);
    await expect(page.getByRole("heading", { name: items.hlk.name })).toBeVisible();
  });

  test("cannot reach another campus's item by URL", async ({ page }) => {
    const response = await page.goto(`/items/${items.hne.id}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
    await expect(page.getByText(items.hne.name)).toHaveCount(0);
  });

  test("cannot open settings or user administration", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
    expect((await page.goto("/settings"))?.status()).toBe(404);
    expect((await page.goto("/settings/users"))?.status()).toBe(404);
  });
});
