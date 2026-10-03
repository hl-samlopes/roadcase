import { expect, test } from "@playwright/test";

test("placeholder page shows the product name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Roadcase" })).toBeVisible();
});
