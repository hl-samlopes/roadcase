import { expect, test } from "@playwright/test";
import { accounts } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

test("an organization admin adds a location and links a new department to it", async ({ page }) => {
  await signIn(page, accounts.admin);
  await page.goto("/settings");
  await page.getByRole("link", { name: "Locations and departments" }).click();

  const hsc = page.locator("section", {
    has: page.getByRole("heading", { name: "Hume SoCal (HSC)" }),
  });
  await hsc.getByLabel("Name").last().fill("Lakeside Pavilion");
  await hsc.getByLabel("Short code").last().fill("lp");
  await hsc.getByRole("button", { name: "Add location at HSC" }).click();
  await expect(page.getByText("Added Lakeside Pavilion to HSC.")).toBeVisible();

  await page.locator("#new-department-name").fill("Food Service");
  await page.getByRole("button", { name: "Add department" }).click();
  await expect(page.getByText("Added Food Service.")).toBeVisible();

  const food = page
    .getByRole("listitem")
    .filter({ hasText: "Locations where Food Service keeps equipment" });
  await food.getByLabel("Lakeside Pavilion (HSC)").check();
  await food.getByRole("button", { name: "Save Food Service locations" }).click();
  await expect(page.getByText("Updated where Food Service keeps equipment.")).toBeVisible();
  await expect(food.getByLabel("Lakeside Pavilion (HSC)")).toBeChecked();
});

test("a department can't drop a location that still holds its items", async ({ page }) => {
  await signIn(page, accounts.admin);
  await page.goto("/settings/locations");
  const production = page
    .getByRole("listitem")
    .filter({ hasText: "Locations where Production keeps equipment" });
  await production.getByLabel("Meadow Ranch (HLK)").uncheck();
  await production.getByRole("button", { name: "Save Production locations" }).click();
  await expect(production.getByRole("alert")).toContainText("Meadow Ranch still has");
});

test("editors can't open location settings", async ({ page }) => {
  await signIn(page, accounts.meadowRanchEditor);
  expect((await page.goto("/settings/locations"))?.status()).toBe(404);
});
