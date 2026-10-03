import { expect, test } from "@playwright/test";
import { accounts } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

test("organization admins add, rename and delete item conditions", async ({ page }) => {
  await signIn(page, accounts.admin);
  await page.goto("/settings");
  await page.getByRole("link", { name: "Item conditions" }).click();
  await expect(page.getByRole("heading", { name: "Item conditions" })).toBeVisible();
  // Defaults from the seed, with Good as the default condition.
  await expect(page.getByRole("heading", { name: "Needs repair" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Make Good the default" })).toHaveCount(0);

  const add = page.locator("section", {
    has: page.getByRole("heading", { name: "Add a condition" }),
  });
  await add.getByLabel("Name").fill("Needs calibration");
  await add.getByLabel(/starts a repair ticket/).check();
  await add.getByRole("button", { name: "Add condition" }).click();
  await expect(page.getByRole("heading", { name: "Needs calibration" })).toBeVisible();

  const card = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Needs calibration" }) });
  await expect(card.getByText("Starts a repair ticket", { exact: true })).toBeVisible();
  await card.getByLabel("Name").fill("Calibration due");
  await card.getByRole("button", { name: "Save Needs calibration" }).click();
  await expect(page.getByRole("heading", { name: "Calibration due" })).toBeVisible();

  // Duplicate names are refused.
  await add.getByLabel("Name").fill("Good");
  await add.getByRole("button", { name: "Add condition" }).click();
  await expect(add.getByRole("alert")).toContainText("Another condition already has this name.");

  await page.getByRole("button", { name: "Delete Calibration due" }).click();
  await expect(page.getByRole("heading", { name: "Calibration due" })).toHaveCount(0);
});

test("only organization admins can manage conditions", async ({ page }) => {
  await signIn(page, accounts.meadowRanchEditor);
  expect((await page.goto("/settings/conditions"))?.status()).toBe(404);
});
