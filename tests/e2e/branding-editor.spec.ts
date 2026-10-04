import { expect, test, type Page } from "@playwright/test";
import { accounts, appearanceOrganization as org } from "./fixtures.ts";
import { cssVariable, openUserMenu, signIn } from "./helpers.ts";

// These tests change one organization's appearance step by step.
test.describe.configure({ mode: "serial" });

const files = "tests/e2e/files";

async function openAppearance(page: Page) {
  await signIn(page, org.admin, org.slug);
  await page.goto("/settings");
  await page.getByRole("link", { name: "Appearance" }).click();
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
}

function previewVariable(page: Page, name: string) {
  return page
    .getByRole("complementary", { name: "Preview" })
    .locator("[style]")
    .first()
    .evaluate((el, variable) => getComputedStyle(el).getPropertyValue(variable).trim(), name);
}

test("the preview updates live and warns about low contrast", async ({ page }) => {
  await openAppearance(page);
  await expect(page.getByText("All text colors meet 4.5:1 contrast in both modes.")).toBeVisible();

  await page.locator("#light_muted").fill("#CCCCCC");
  await expect(
    page.getByText(
      "Warning: Muted text on surface in light mode is 1.6:1; it needs at least 4.5:1.",
    ),
  ).toBeVisible();
  expect(await previewVariable(page, "--muted")).toBe("#CCCCCC");

  await page.getByRole("button", { name: "Use default Muted text, light mode" }).click();
  await expect(page.getByText("All text colors meet 4.5:1 contrast in both modes.")).toBeVisible();

  await page.getByRole("button", { name: "Dark", exact: true }).click();
  expect(await previewVariable(page, "--bg")).toBe("#0F1319");
});

test("saved changes reach everyone and the signed-out sign-in page", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await openAppearance(admin);
  await admin.getByLabel("Display name").fill("Fieldhouse Production");
  await admin.locator("#light_accent").fill("#7A1FA2");
  await admin.locator("#light_bg").fill("#FAF7F2");
  await admin.getByLabel("Heading font").selectOption({ label: "Space Mono" });
  await admin.getByLabel("Corner radius (px)").fill("0");
  await admin.getByLabel("Default text size").selectOption("115");
  await admin.getByLabel("Headline").fill("Welcome to the Fieldhouse");
  await admin.getByLabel("Welcome message").fill("Use your staff account.");
  await admin.getByRole("button", { name: "Save appearance" }).click();
  await expect(admin.getByText("Done: Appearance saved.")).toBeVisible();

  // Signed out: the organization's sign-in page shows its branding.
  const viewer = await (await browser.newContext()).newPage();
  await viewer.goto(`/sign-in/${org.slug}`);
  await expect(viewer).toHaveTitle("Sign in · Fieldhouse Production");
  await expect(viewer.getByRole("heading", { name: "Welcome to the Fieldhouse" })).toBeVisible();
  await expect(viewer.getByText("Use your staff account.")).toBeVisible();
  expect(await cssVariable(viewer, "--accent")).toBe("#7A1FA2");

  // Signed in: every page uses the new look.
  await signIn(viewer, org.viewer, org.slug);
  await expect(viewer).toHaveTitle("Inventory · Fieldhouse Production");
  await expect(viewer.getByRole("link", { name: "Fieldhouse Production" })).toBeVisible();
  expect(await cssVariable(viewer, "--accent")).toBe("#7A1FA2");
  expect(await cssVariable(viewer, "--bg")).toBe("#FAF7F2");
  expect(await cssVariable(viewer, "--radius")).toBe("0px");
  expect(await viewer.evaluate(() => getComputedStyle(document.body).fontSize)).toBe("13.8px");
  const headingFont = await viewer
    .getByRole("heading", { name: "Inventory" })
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(headingFont).toMatch(/Space Mono/i);

  // Other organizations keep their own look.
  const other = await (await browser.newContext()).newPage();
  await signIn(other, accounts.campusSwitcher);
  expect(await cssVariable(other, "--accent")).toBe("#1B5FD1");
  await expect(other).toHaveTitle("Inventory · Roadcase");
});

test("logos, favicon and backgrounds upload and show before sign-in", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await openAppearance(admin);

  await admin.locator("#branding-logoLight").setInputFiles(`${files}/not-an-image.png`);
  await admin.getByRole("button", { name: "Upload logo for light mode" }).click();
  await expect(admin.getByText("Images must be JPEG, PNG or WebP images.")).toBeVisible();

  await admin.locator("#branding-logoLight").setInputFiles(`${files}/speaker.png`);
  await admin.getByRole("button", { name: "Upload logo for light mode" }).click();
  await expect(admin.getByRole("img", { name: "Current logo for light mode" })).toBeVisible();
  await admin.locator("#branding-favicon").setInputFiles(`${files}/speaker.png`);
  await admin.getByRole("button", { name: "Upload favicon" }).click();
  await expect(admin.getByRole("img", { name: "Current favicon" })).toBeVisible();
  await admin.locator("#branding-signInBackground").setInputFiles(`${files}/speaker.png`);
  await admin.getByRole("button", { name: "Upload sign-in background" }).click();
  await expect(admin.getByRole("img", { name: "Current sign-in background" })).toBeVisible();

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/sign-in/${org.slug}`);
  const logo = visitor.locator("img.logo-light");
  await expect(logo).toHaveAttribute("alt", "Fieldhouse Production");
  await expect
    .poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(visitor.locator('link[rel="icon"]')).toHaveAttribute("href", /\/branding\//);
});

test("organization admins limit which accents and fonts people can pick", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await openAppearance(admin);
  for (const accent of ["Blue", "Purple", "Green", "Orange", "Magenta"]) {
    await admin.getByRole("checkbox", { name: accent, exact: true }).uncheck();
  }
  await admin.getByRole("checkbox", { name: "Space Mono and Plus Jakarta Sans" }).uncheck();
  await admin.getByRole("button", { name: "Save appearance" }).click();
  await expect(admin.getByText("Done: Appearance saved.")).toBeVisible();

  const viewer = await (await browser.newContext()).newPage();
  await signIn(viewer, org.viewer, org.slug);
  await openUserMenu(viewer);
  await viewer.getByRole("link", { name: "Preferences" }).click();
  await expect(viewer.getByLabel("Teal")).toBeVisible();
  await expect(viewer.getByLabel("Blue")).toHaveCount(0);
  await expect(viewer.getByLabel("Space Mono and Plus Jakarta Sans")).toHaveCount(0);
  await expect(viewer.getByLabel("Inter and Krub")).toBeVisible();
});

test("reset restores the Roadcase defaults for everyone", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await openAppearance(admin);
  await admin.getByRole("button", { name: "Reset appearance to Roadcase defaults" }).click();
  await expect(admin.getByText("Done: Appearance reset to the Roadcase defaults.")).toBeVisible();

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/sign-in/${org.slug}`);
  await expect(visitor.getByRole("heading", { name: "Sign in to Roadcase" })).toBeVisible();
  await expect(visitor.locator("img.logo-light")).toHaveCount(0);
  expect(await cssVariable(visitor, "--accent")).toBe("#1B5FD1");

  await signIn(visitor, org.viewer, org.slug);
  await expect(visitor).toHaveTitle("Inventory · Roadcase");
  expect(await cssVariable(visitor, "--bg")).toBe("#F6F7F9");
  expect(await cssVariable(visitor, "--radius")).toBe("6px");
  expect(await visitor.evaluate(() => getComputedStyle(document.body).fontSize)).toBe("12px");
});

test("only organization admins can open Appearance", async ({ page }) => {
  await signIn(page, org.viewer, org.slug);
  expect((await page.goto("/settings/appearance"))?.status()).toBe(404);
});
