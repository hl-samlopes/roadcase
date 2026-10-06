import { expect, test } from "@playwright/test";
import { accounts } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

test("organization admins add, rename, order and remove categories and subcategories", async ({
  page,
}) => {
  await signIn(page, accounts.admin);
  await page.goto("/settings");
  await page.getByRole("link", { name: "Categories" }).click();
  const card = page.getByRole("region", { name: "Categories" });

  await card.getByRole("button", { name: "Add category" }).click();
  await card.getByLabel("Name", { exact: true }).fill("Rigging");
  await card.getByRole("button", { name: "Add category" }).last().click();
  await expect(page.getByText("Done: Added Rigging.")).toBeVisible();

  const table = page.getByRole("table", { name: "Categories" });
  await table.getByRole("button", { name: "Edit Rigging" }).click();
  await table.getByLabel("New subcategory").fill("Chain motors");
  await table.getByRole("button", { name: "Add to Rigging" }).click();
  await expect(page.getByText("Done: Added Chain motors to Rigging.")).toBeVisible();
  await expect(table.getByRole("row", { name: /^Rigging Chain motors/ })).toBeVisible();

  // Renaming a subcategory, then moving the category up the list.
  await table.getByLabel(/^Chain motors, 0 items/).fill("Motors");
  await table.getByRole("button", { name: "Save Chain motors" }).click();
  await expect(page.getByText("Done: Saved Motors.")).toBeVisible();
  await table.getByRole("button", { name: "Move Rigging up" }).click();
  await expect(table.getByRole("button", { name: "Move Rigging down" })).toBeVisible();

  // Nothing uses them, so they can be deleted outright.
  await table.getByRole("button", { name: "Delete Motors" }).click();
  // Its row (and that row's message) goes away; the chip in the summary row too.
  await expect(table.getByLabel(/^Motors, 0 items/)).toHaveCount(0);
  await expect(table.getByRole("row", { name: /^Rigging None/ })).toBeVisible();
  await table.getByRole("button", { name: "Delete Rigging" }).click();
  // (The seeded Staging category has its own "Rigging" subcategory, so check the row.)
  await expect(table.getByRole("button", { name: "Edit Rigging" })).toHaveCount(0);

  // A category items use is archived, never deleted.
  await table.getByRole("button", { name: "Edit Cabling" }).click();
  await expect(table.getByRole("button", { name: "Archive Cabling" })).toBeVisible();
  await expect(table.getByRole("button", { name: "Delete Cabling" })).toHaveCount(0);
});

test("only organization admins can manage categories", async ({ page }) => {
  await signIn(page, accounts.meadowRanchEditor);
  expect((await page.goto("/settings/categories"))?.status()).toBe(404);
});
