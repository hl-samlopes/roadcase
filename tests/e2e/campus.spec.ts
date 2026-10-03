import { expect, test } from "@playwright/test";
import { accounts, items } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

test("the campus switcher filters inventory and is remembered", async ({ page }) => {
  await signIn(page, accounts.campusSwitcher);
  await expect(page.getByText("Showing all campuses")).toBeVisible();
  await expect(page.getByRole("link", { name: items.hlk.name })).toBeVisible();
  await expect(page.getByRole("link", { name: items.hne.name })).toBeVisible();

  await page.getByText("Campus:").click();
  await page.getByRole("button", { name: "Hume New England (HNE)" }).click();
  await expect(page.getByText("Showing Hume New England (HNE)")).toBeVisible();
  await expect(page.getByRole("link", { name: items.hne.name })).toBeVisible();
  await expect(page.getByRole("link", { name: items.hlk.name })).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("Showing Hume New England (HNE)")).toBeVisible();

  await page.getByText("Campus:").click();
  await page.getByRole("button", { name: "All campuses" }).click();
  await expect(page.getByText("Showing all campuses")).toBeVisible();
});

test("the campus switcher offers only campuses the user can reach", async ({ page }) => {
  await signIn(page, accounts.meadowRanchEditor);
  await page.getByText("Campus:").click();
  const options = page.getByRole("list", { name: "Switch campus" }).getByRole("button");
  await expect(options).toHaveText(["All campuses (current)", "Hume Lake (HLK)"]);
});
