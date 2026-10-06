import { expect, test } from "@playwright/test";
import { accounts, appearanceOrganization as emptyOrg } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

test("an organization admin adds a location and links a new department to it", async ({ page }) => {
  await signIn(page, accounts.admin);
  await page.goto("/settings");
  await page.getByRole("link", { name: "Locations and departments" }).click();

  const locations = page.getByRole("region", { name: "Locations" });
  await locations.getByRole("button", { name: "Add location" }).click();
  await locations.getByLabel("Campus", { exact: true }).selectOption({ label: "Hume SoCal (HSC)" });
  await locations.getByLabel("Name", { exact: true }).fill("Lakeside Pavilion");
  await locations.getByLabel("Short code", { exact: true }).fill("lp");
  await locations.getByRole("button", { name: "Add location" }).last().click();
  await expect(page.getByText("Added Lakeside Pavilion to HSC.")).toBeVisible();

  // Filtering by campus shows only that campus's locations, without the Campus column.
  await locations.getByRole("link", { name: /^Hume SoCal \(HSC\)/ }).click();
  const table = page.getByRole("table", { name: "Locations" });
  await expect(table.getByText("Lakeside Pavilion", { exact: true })).toBeVisible();
  await expect(table.getByText("Meadow Ranch", { exact: true })).toHaveCount(0);
  await expect(table.getByRole("columnheader", { name: "Campus" })).toHaveCount(0);

  // A new department can be linked to locations as it's added.
  const departments = page.getByRole("region", { name: "Departments" });
  await departments.getByRole("button", { name: "Add department" }).click();
  await departments.getByLabel("Name", { exact: true }).fill("Food Service");
  await departments.getByLabel("Lakeside Pavilion").check();
  await departments.getByRole("button", { name: "Add department" }).last().click();
  await expect(page.getByText("Added Food Service.")).toBeVisible();
  const food = page.getByRole("row", { name: /Food Service/ });
  await expect(food).toContainText("Lakeside Pavilion · HSC");

  // Editing in place: rename, and the row updates.
  await departments.getByRole("button", { name: "Edit Food Service" }).click();
  await departments.getByLabel("Name").first().fill("Food Services");
  await departments.getByRole("button", { name: "Save Food Service" }).click();
  await expect(page.getByText("Done: Saved Food Services.")).toBeVisible();
});

test("a department can't drop a location that still holds its items", async ({ page }) => {
  await signIn(page, accounts.admin);
  await page.goto("/settings/locations");
  const departments = page.getByRole("region", { name: "Departments" });
  await departments.getByRole("button", { name: "Edit Production" }).click();
  await departments.getByLabel("Meadow Ranch").uncheck();
  await departments.getByRole("button", { name: "Save Production" }).click();
  await expect(
    departments.getByRole("alert").filter({ hasText: "Meadow Ranch still has" }),
  ).toBeVisible();
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
  await expect(admin.getByText("Add at least one location and one department")).toBeVisible();
  await admin.getByRole("link", { name: "Set up locations" }).click();
  await expect(admin.getByRole("heading", { name: "Before items can be added" })).toBeVisible();
  await expect(admin.getByText("1. Add a location on a campus (to do)")).toBeVisible();

  // People who can't set up locations just see the empty list.
  const viewer = await (await browser.newContext()).newPage();
  await signIn(viewer, emptyOrg.viewer, emptyOrg.slug);
  await expect(viewer.getByRole("status")).toHaveText("No items yet.");
  await expect(viewer.getByRole("link", { name: "Set up locations" })).toHaveCount(0);

  // Campus admins can add locations but not departments, so they're told who does the rest.
  const campusAdmin = await (await browser.newContext()).newPage();
  await signIn(campusAdmin, emptyOrg.campusAdmin, emptyOrg.slug);
  await expect(
    campusAdmin.getByText("an organization admin then needs to add a department"),
  ).toBeVisible();
  await campusAdmin.getByRole("link", { name: "Set up locations" }).click();
  await expect(
    campusAdmin.getByText("Organization admins add departments and link them to locations."),
  ).toBeVisible();
  await expect(campusAdmin.getByRole("heading", { name: "Departments", exact: true })).toHaveCount(
    0,
  );
});
