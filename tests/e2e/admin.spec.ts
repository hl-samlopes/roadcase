import { expect, test } from "@playwright/test";
import { accounts, items } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

test("an admin creates a campus-scoped user who sees only that campus", async ({ browser }) => {
  const adminPage = await (await browser.newContext()).newPage();
  await signIn(adminPage, accounts.admin);
  await adminPage.getByRole("link", { name: "Settings" }).click();
  await adminPage.getByRole("link", { name: "Users" }).click();
  await adminPage.getByRole("link", { name: "New user" }).click();

  const newUser = { username: "hne-viewer", password: "e2e-hne-viewer-pass-1" };
  await adminPage.getByLabel("Username").fill(newUser.username);
  await adminPage.getByLabel("Display name").fill("HNE Viewer");
  await adminPage.getByLabel("Email").fill("hne-viewer@example.com");
  await adminPage.getByLabel("Password").fill(newUser.password);
  await adminPage.getByLabel("Access level").selectOption("VIEWER");
  await adminPage.getByLabel("Applies to").selectOption({ label: "Hume New England (HNE)" });
  await adminPage.getByRole("button", { name: "Create user" }).click();
  await expect(adminPage.getByText("Done: account created.")).toBeVisible();
  await expect(adminPage.getByText("Viewer: Hume New England (HNE)")).toBeVisible();

  const userPage = await (await browser.newContext()).newPage();
  await signIn(userPage, newUser);
  await expect(userPage.getByRole("link", { name: items.hne.name })).toBeVisible();
  await expect(userPage.getByText(items.hlk.code)).toHaveCount(0);
  expect((await userPage.goto(`/items/${items.hlk.id}`))?.status()).toBe(404);
});

test("deactivating a user signs them out and blocks sign-in", async ({ browser }) => {
  const userPage = await (await browser.newContext()).newPage();
  await signIn(userPage, accounts.toDeactivate);

  const adminPage = await (await browser.newContext()).newPage();
  await signIn(adminPage, accounts.admin);
  await adminPage.goto("/settings/users");
  await adminPage.getByRole("link", { name: "Manage Soon Deactivated" }).click();
  await adminPage.getByRole("button", { name: "Deactivate account" }).click();
  await expect(adminPage.getByText("Done: Account deactivated and signed out.")).toBeVisible();

  await userPage.goto("/items");
  await expect(userPage).toHaveURL(/\/sign-in$/);

  await userPage.getByLabel("Username").fill(accounts.toDeactivate.username);
  await userPage.getByLabel("Password").fill(accounts.toDeactivate.password);
  await userPage.getByRole("button", { name: "Sign in" }).click();
  await expect(userPage.locator("form").getByRole("alert")).toContainText(
    "don't match an active account",
  );
});

test("an admin changes a username; the new one signs in and the old one stops working", async ({
  browser,
}) => {
  const adminPage = await (await browser.newContext()).newPage();
  await signIn(adminPage, accounts.admin);
  await adminPage.goto("/settings/users");
  await adminPage.getByRole("link", { name: "Manage Jordan Smith" }).click();

  const profile = adminPage.locator("section", {
    has: adminPage.getByRole("heading", { name: "Profile" }),
  });
  await profile.getByLabel("Username").fill(accounts.admin.username);
  await profile.getByRole("button", { name: "Save profile" }).click();
  await expect(profile.getByRole("alert")).toContainText(
    "Username: Another account already uses this.",
  );

  await profile.getByLabel("Username").fill("Jordan-Lee");
  await profile.getByRole("button", { name: "Save profile" }).click();
  await expect(profile.getByText('They now sign in as "jordan-lee".')).toBeVisible();

  const userPage = await (await browser.newContext()).newPage();
  await signIn(userPage, { username: "jordan-lee", password: accounts.toRename.password });

  const oldName = await (await browser.newContext()).newPage();
  await oldName.goto("/sign-in");
  await oldName.getByLabel("Username").fill(accounts.toRename.username);
  await oldName.getByLabel("Password").fill(accounts.toRename.password);
  await oldName.getByRole("button", { name: "Sign in" }).click();
  await expect(oldName.locator("form").getByRole("alert")).toContainText(
    "don't match an active account",
  );
});
