import { expect, test } from "@playwright/test";
import { harborOrganization as org } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

test("an item with no history can be deleted; one with history can't", async ({ page }) => {
  await signIn(page, org.editor, org.slug);

  // On a check-out: explained, not deletable.
  await page.goto(`/items/scan?code=${org.mic.code}`);
  const card = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Delete item" }) });
  await expect(card).toContainText("This item has history (check-outs)");
  await expect(card.getByRole("button", { name: /Delete/ })).toHaveCount(0);

  // Never used: deleted, and gone from the inventory.
  await page.goto(`/items/scan?code=${org.spare.code}`);
  await page.getByText("Delete this item…").click();
  await page.getByRole("button", { name: `Delete ${org.spare.code} permanently` }).click();
  await expect(page).toHaveURL(/\/items\?deleted=/);
  await expect(page.getByText(`Done: deleted ${org.spare.code} ${org.spare.name}.`)).toBeVisible();
  await page.goto(`/items/scan?code=${org.spare.code}`);
  await expect(page.getByText(`No item you can see has the code ${org.spare.code}.`)).toBeVisible();
});
