import { expect, test } from "@playwright/test";
import { accounts, appearanceOrganization as emptyOrg } from "./fixtures.ts";
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

test("a new organization is pointed to location setup before it can add items", async ({
  browser,
}) => {
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, emptyOrg.admin, emptyOrg.slug);
  await expect(admin.getByRole("status")).toHaveText("No items yet.");
  await expect(admin.getByRole("link", { name: "New item" })).toHaveCount(0);
  await admin.getByRole("link", { name: "Set up locations and departments" }).click();
  await expect(admin.getByRole("heading", { name: "Before items can be added" })).toBeVisible();
  await expect(admin.getByText("1. Add a location on a campus (to do)")).toBeVisible();

  // People who can't set up locations just see the empty list.
  const viewer = await (await browser.newContext()).newPage();
  await signIn(viewer, emptyOrg.viewer, emptyOrg.slug);
  await expect(viewer.getByRole("status")).toHaveText("No items yet.");
  await expect(viewer.getByRole("link", { name: "Set up locations and departments" })).toHaveCount(
    0,
  );
});
