import { expect, test } from "@playwright/test";
import { accounts, brandedOrganization as org } from "./fixtures.ts";
import { cssVariable } from "./helpers.ts";

test("the default sign-in page uses the Roadcase look", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page).toHaveTitle("Sign in · Roadcase");
  await expect(page.getByRole("heading", { name: "Sign in to Roadcase" })).toBeVisible();
  expect(await cssVariable(page, "--accent")).toBe("#1B5FD1");
});

test("an organization's sign-in page shows its branding by path", async ({ page }) => {
  await page.goto(`/sign-in/${org.slug}`);
  await expect(page).toHaveTitle(`Sign in · ${org.displayName}`);
  await expect(page.getByRole("heading", { name: org.signInHeadline })).toBeVisible();
  await expect(page.getByText(org.signInMessage)).toBeVisible();
  expect(await cssVariable(page, "--accent")).toBe(org.lightAccent);
});

test("an organization's sign-in page shows its branding by subdomain", async ({
  page,
  baseURL,
}) => {
  const url = new URL("/sign-in", baseURL);
  url.hostname = `${org.slug}.localhost`;
  await page.goto(url.toString());
  await expect(page.getByRole("heading", { name: org.signInHeadline })).toBeVisible();
  expect(await cssVariable(page, "--accent")).toBe(org.lightAccent);
});

test("unknown organizations get a 404", async ({ page }) => {
  expect((await page.goto("/sign-in/no-such-organization"))?.status()).toBe(404);
});

test("accounts only sign in to their own organization", async ({ page }) => {
  await page.goto(`/sign-in/${org.slug}`);
  await page.getByLabel("Username").fill(accounts.meadowRanchEditor.username);
  await page.getByLabel("Password").fill(accounts.meadowRanchEditor.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "don't match an active account",
  );
});
