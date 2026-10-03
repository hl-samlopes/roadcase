import { expect, type Page } from "@playwright/test";

export async function signIn(page: Page, account: { username: string; password: string }) {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/items$/);
}

export async function openUserMenu(page: Page) {
  await page.locator("summary", { hasText: "Account menu for" }).click();
}

export async function signOut(page: Page) {
  await openUserMenu(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in\/hume$/);
}

/** WCAG contrast between two CSS variables as rendered on the page. */
export function contrastBetween(page: Page, foreground: string, background: string) {
  return page.evaluate(
    ([fg, bg]) => {
      const style = getComputedStyle(document.documentElement);
      const luminance = (hex: string) => {
        const value = parseInt(hex.trim().slice(1), 16);
        const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const [hi, lo] = [
        luminance(style.getPropertyValue(fg)),
        luminance(style.getPropertyValue(bg)),
      ].sort((a, b) => b - a);
      return (hi + 0.05) / (lo + 0.05);
    },
    [foreground, background],
  );
}

export function cssVariable(page: Page, name: string) {
  return page.evaluate(
    (variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(),
    name,
  );
}
