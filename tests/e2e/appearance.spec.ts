import { expect, test, type Page } from "@playwright/test";
import { accounts } from "./fixtures.ts";
import { contrastBetween, cssVariable, openUserMenu, signIn, signOut } from "./helpers.ts";

const pairs: [string, string][] = [
  ["--text", "--bg"],
  ["--text", "--surface"],
  ["--muted", "--bg"],
  ["--muted", "--surface"],
  ["--accent", "--bg"],
  ["--accent", "--surface"],
];

async function expectReadable(page: Page) {
  for (const [foreground, background] of pairs) {
    const ratio = await contrastBetween(page, foreground, background);
    expect(ratio, `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
  }
}

test("mode, accent and fonts persist across sessions and stay readable", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, accounts.preferences);

  // Roadcase defaults: light mode, blue accent.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await cssVariable(page, "--accent")).toBe("#1B5FD1");
  await expectReadable(page);

  await openUserMenu(page);
  await page.getByRole("link", { name: "Preferences" }).click();
  await page.getByLabel("Dark").check();
  await page.getByLabel("Teal").check();
  await page.getByLabel("Space Mono and Plus Jakarta Sans").check();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Done: Preferences saved.")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await signOut(page);

  // A new browser session picks up the saved choices from the account.
  const later = await (await browser.newContext()).newPage();
  await signIn(later, accounts.preferences);
  await expect(later.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await cssVariable(later, "--accent")).toBe("#3CC7B8");
  expect(await cssVariable(later, "--bg")).toBe("#0F1319");
  const headingFont = await later
    .getByRole("heading", { name: "Inventory" })
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(headingFont).toMatch(/Space Mono/i);
  await expectReadable(later);

  // "Match my device" follows the operating system setting.
  await openUserMenu(later);
  await later.getByRole("link", { name: "Preferences" }).click();
  await later.getByLabel("Match my device").check();
  await later.getByRole("button", { name: "Save preferences" }).click();
  await expect(later.getByText("Done: Preferences saved.")).toBeVisible();
  await expect(later.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  await later.emulateMedia({ colorScheme: "dark" });
  expect(await cssVariable(later, "--bg")).toBe("#0F1319");
  await later.emulateMedia({ colorScheme: "light" });
  expect(await cssVariable(later, "--bg")).toBe("#F6F7F9");
  await expectReadable(later);
});

test("text size scales body text and headings and persists", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, accounts.textSize);
  const bodySize = () => page.evaluate(() => getComputedStyle(document.body).fontSize);
  const headingSize = () =>
    page
      .locator("h1")
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize);

  expect(await bodySize()).toBe("14px");
  expect(await headingSize()).toBe("24px");

  await openUserMenu(page);
  await page.getByRole("link", { name: "Preferences" }).click();
  await page.getByLabel(/^Largest \(150%/).check();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Done: Preferences saved.")).toBeVisible();
  expect(await bodySize()).toBe("18px");
  expect(await headingSize()).toBe("36px");

  const later = await (await browser.newContext()).newPage();
  await signIn(later, accounts.textSize);
  expect(await later.evaluate(() => getComputedStyle(document.body).fontSize)).toBe("18px");
});
