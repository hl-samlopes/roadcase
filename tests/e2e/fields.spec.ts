import { expect, test } from "@playwright/test";
import { accounts } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

test("organization admins add, rename, delete and restore custom fields", async ({ page }) => {
  await signIn(page, accounts.admin);
  await page.goto("/settings");
  await page.getByRole("link", { name: "Inventory fields" }).click();

  const add = page.locator("section", { has: page.getByRole("heading", { name: "Add a field" }) });
  await add.getByLabel("Name").fill("Power");
  await add.getByLabel("Type").selectOption("DROPDOWN");
  await add.getByRole("button", { name: "Add field" }).click();
  await expect(add.getByRole("alert")).toContainText("Add at least one option");

  await add.getByLabel("Options").fill("AC\nBattery\nAC");
  await add.getByRole("button", { name: "Add field" }).click();
  await expect(page.getByText('Done: Added "Power".')).toBeVisible();

  const card = page
    .getByRole("listitem")
    .filter({ hasText: "Dropdown" })
    .filter({ hasText: "Power" });
  await expect(card.getByLabel("Options")).toHaveValue("AC\nBattery");
  await card.getByLabel("Name").fill("Power source");
  await card.getByRole("button", { name: "Save Power" }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Power source" }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Delete Power source" }).click();
  const deleted = page.locator("section", {
    has: page.getByRole("heading", { name: "Deleted fields" }),
  });
  await deleted.getByRole("button", { name: "Restore Power source" }).click();
  await expect(page.getByRole("button", { name: "Delete Power source" })).toBeVisible();
  // Leave it deleted so other tests' item forms don't change.
  await page.getByRole("button", { name: "Delete Power source" }).click();
  await expect(page.getByRole("button", { name: "Restore Power source" })).toBeVisible();
});
