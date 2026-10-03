import { expect, test } from "@playwright/test";
import { accounts } from "./fixtures.ts";
import { openUserMenu, signIn } from "./helpers.ts";

test("changing a password keeps this device signed in and signs out others", async ({
  browser,
}) => {
  const account = accounts.passwordChanger;
  const newPassword = "e2e-pw-changer-new-pass-2";

  const otherDevice = await (await browser.newContext()).newPage();
  await signIn(otherDevice, account);

  const page = await (await browser.newContext()).newPage();
  await signIn(page, account);
  await openUserMenu(page);
  await page.getByRole("link", { name: "Change password" }).click();

  await page.getByLabel("Current password").fill("wrong-current-password");
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "isn't your current password",
  );

  await page.getByLabel("Current password").fill(account.password);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Done: your password was changed.")).toBeVisible();

  await page.goto("/items");
  await expect(page).toHaveURL(/\/items$/);

  await otherDevice.goto("/items");
  await expect(otherDevice).toHaveURL(/\/sign-in$/);
  await signIn(otherDevice, { ...account, password: newPassword });
});
