import { expect, test, type Page } from "@playwright/test";
import { accounts } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

const LOCKED = "Too many failed sign-in attempts.";
const INVALID = "don't match an active account";

async function attempt(page: Page, username: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  return page.locator("form").getByRole("alert");
}

test("five failed attempts lock a username until an admin unlocks it", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  for (let i = 0; i < 5; i++) {
    await expect(
      await attempt(page, accounts.lockout.username, `wrong-password-${i}`),
    ).toContainText(INVALID);
  }
  // Even the right password is refused while locked.
  await expect(
    await attempt(page, accounts.lockout.username, accounts.lockout.password),
  ).toContainText(LOCKED);

  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, accounts.admin);
  await admin.goto("/settings/users");
  await admin.getByRole("link", { name: "Manage Lockout Tester" }).click();
  await expect(admin.getByText("Sign-in stays locked for about 15 more minutes")).toBeVisible();
  await admin.getByRole("button", { name: "Unlock sign-in" }).click();
  // Once unlocked, the lock notice goes away.
  await expect(admin.getByRole("heading", { name: "Sign-in locked" })).toHaveCount(0);

  await signIn(page, accounts.lockout);
});

test("unknown usernames lock the same way, so locks don't reveal which accounts exist", async ({
  page,
}) => {
  for (let i = 0; i < 5; i++) {
    await expect(await attempt(page, "no-such-person", `guess-${i}`)).toContainText(INVALID);
  }
  await expect(await attempt(page, "no-such-person", "guess-6")).toContainText(LOCKED);
});
