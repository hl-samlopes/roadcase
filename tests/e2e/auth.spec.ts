import { expect, test } from "@playwright/test";
import { accounts } from "./fixtures.ts";
import { signIn, signOut } from "./helpers.ts";

test("signed-out visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/items");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in to Roadcase" })).toBeVisible();
});

test("a wrong password shows a generic error", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(accounts.meadowRanchEditor.username);
  await page.getByLabel("Password").fill("not-the-right-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "don't match an active account",
  );
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("usernames are case-insensitive and sign-out ends the session", async ({ page }) => {
  await signIn(page, {
    ...accounts.meadowRanchEditor,
    username: accounts.meadowRanchEditor.username.toUpperCase(),
  });
  await expect(page.getByText("Account menu for")).toBeAttached();
  await expect(page.locator("summary", { hasText: "Meadow Ranch Editor" })).toBeVisible();
  await signOut(page);
  await page.goto("/items");
  await expect(page).toHaveURL(/\/sign-in$/);
});
