import { expect, type Page } from "@playwright/test";

export async function signIn(page: Page, account: { username: string; password: string }) {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/items$/);
}
