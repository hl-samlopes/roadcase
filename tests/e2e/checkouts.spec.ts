import { expect, test, type Page } from "@playwright/test";
import { notifyOrganization as org } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

// One story: a draft is built, a second check-out competes for an item, then access is checked.
test.describe.configure({ mode: "serial" });

let firstUrl = "";
let secondUrl = "";

async function newDraft(page: Page, group: string) {
  await page.goto("/checkouts");
  await page.getByRole("link", { name: "New check-out" }).click();
  await page.getByLabel("Guest group").fill(group);
  await page.getByLabel("Name", { exact: true }).fill("Alex Rivera");
  await page.getByLabel("Email").fill("Alex.Rivera@Example.com");
  await page.getByLabel("Phone").fill("(555) 123-4567");
  await page.getByLabel("Date back").fill("2030-01-15");
  await page.getByRole("button", { name: "Create draft check-out" }).click();
  await expect(page.getByText(/Done: draft check-out #\d+ created/)).toBeVisible();
  return page.url().replace(/\?.*$/, "");
}

async function scan(page: Page, codes: string) {
  const field = page.getByLabel("Scan or type item codes");
  await field.fill(codes);
  await field.press("Enter");
}

test("an editor builds a draft by scanning, with optional fees", async ({ page }) => {
  await signIn(page, org.editor, org.slug);
  firstUrl = await newDraft(page, "Youth group");
  await expect(page.getByRole("heading", { name: "Check-out #1: Youth group" })).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  // Staff representative defaults to the person creating it; email is stored lowercase.
  await expect(page.getByText("alex.rivera@example.com")).toBeVisible();
  await expect(page.getByText("Signal Editor").first()).toBeVisible();

  await scan(page, "sgn-000001");
  await expect(page.getByText(`Done: Added ${org.item.code} ${org.item.name}.`)).toBeVisible();

  // Several at once: one goes on, each refusal says why.
  await scan(page, `${org.micStand.code} ${org.oldDiBox.code} ${org.southMixer.code} NOPE-1`);
  await expect(
    page.getByText(`Done: Added ${org.micStand.code} ${org.micStand.name}.`),
  ).toBeVisible();
  const refused = page.getByRole("alert").filter({ hasText: "added:" });
  await expect(refused).toContainText("These items weren't added:");
  await expect(refused).toContainText(
    `${org.oldDiBox.code} ${org.oldDiBox.name}: Its condition, Poor, isn't available for check-out.`,
  );
  // The North editor can't see South's items, so it's as if the code didn't exist.
  await expect(refused).toContainText(`${org.southMixer.code}: No item you can see has this code.`);
  await expect(refused).toContainText("NOPE-1: No item you can see has this code.");
  await expect(page.getByRole("heading", { name: "Items (2)" })).toBeVisible();

  // Fees are optional; bad amounts are refused per item.
  await page.getByLabel(`Fee for ${org.item.code} ${org.item.name}`).fill("abc");
  await page.getByRole("button", { name: "Save fees" }).click();
  await expect(page.getByText(`${org.item.code} ${org.item.name}: Enter an amount`)).toBeVisible();
  await page.getByLabel(`Fee for ${org.item.code} ${org.item.name}`).fill("$25");
  await page.getByLabel(`Fee for ${org.micStand.code} ${org.micStand.name}`).fill("12.5");
  await page.getByRole("button", { name: "Save fees" }).click();
  await expect(page.getByText("Done: Fees saved.")).toBeVisible();
  await expect(page.getByText("Total fees: $37.50")).toBeVisible();

  await page.getByRole("button", { name: `Remove ${org.micStand.code}` }).click();
  // The row goes away (its own message with it); the count and total update.
  await expect(page.getByRole("heading", { name: "Items (1)" })).toBeVisible();
  await expect(page.getByRole("cell", { name: org.micStand.code })).toHaveCount(0);
  await expect(page.getByText("Total fees: $25.00")).toBeVisible();

  // Search shows what can't be added, and why.
  await page.getByLabel("Or search this campus's equipment").fill("box");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const results = page.getByRole("list", { name: "Search results" });
  await expect(
    results.getByRole("listitem").filter({ hasText: org.item.code }).getByText("On this check-out"),
  ).toBeVisible();
  await expect(
    results.getByText("Can't add: Its condition, Poor, isn't available for check-out."),
  ).toBeVisible();
});

test("an item on one check-out can't go on another until it's released", async ({ page }) => {
  await signIn(page, org.admin, org.slug);
  secondUrl = await newDraft(page, "Choir camp");
  await expect(page.getByRole("heading", { name: "Check-out #2: Choir camp" })).toBeVisible();

  await scan(page, `${org.item.code} ${org.southMixer.code}`);
  const refused = page.getByRole("alert").filter({ hasText: "added:" });
  await expect(refused).toContainText(
    `${org.item.code} ${org.item.name}: It's on check-out #1 (Youth group).`,
  );
  // The admin can see South's mixer, but a North check-out takes North items only.
  await expect(refused).toContainText(
    `${org.southMixer.code} ${org.southMixer.name}: It belongs to SGS; a check-out takes items from its own campus only.`,
  );

  // Picked from search instead of scanned.
  await page.getByLabel("Or search this campus's equipment").fill("stand");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: `Add ${org.micStand.code}` }).click();
  await expect(
    page
      .getByRole("list", { name: "Search results" })
      .getByRole("listitem")
      .filter({ hasText: org.micStand.code })
      .getByText("On this check-out"),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Items (1)" })).toBeVisible();

  // Cancelling the first check-out releases the stage box.
  await page.goto(firstUrl);
  await page.getByRole("button", { name: "Cancel check-out #1" }).click();
  await expect(
    page.getByText("This check-out was cancelled. Its items are free for other check-outs."),
  ).toBeVisible();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Scan or type item codes")).toHaveCount(0);

  await page.goto(secondUrl);
  await scan(page, org.item.code);
  await expect(page.getByText(`Done: Added ${org.item.code} ${org.item.name}.`)).toBeVisible();

  await page.goto("/checkouts");
  await expect(page.getByRole("link", { name: "Choir camp" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Youth group" })).toHaveCount(0);
  await page.getByRole("link", { name: "Returned or cancelled" }).click();
  await expect(page.getByRole("link", { name: "Youth group" })).toBeVisible();
});

test("only campus editors run check-outs; others read or don't see them", async ({ browser }) => {
  const reporter = await (await browser.newContext()).newPage();
  await signIn(reporter, org.reporter, org.slug);
  await reporter.goto("/checkouts");
  await expect(reporter.getByRole("link", { name: "Choir camp" })).toBeVisible();
  await expect(reporter.getByRole("link", { name: "New check-out" })).toHaveCount(0);
  expect((await reporter.goto("/checkouts/new"))?.status()).toBe(404);
  await reporter.goto(secondUrl);
  await expect(reporter.getByRole("heading", { name: "Check-out #2: Choir camp" })).toBeVisible();
  await expect(reporter.getByLabel("Scan or type item codes")).toHaveCount(0);
  await expect(reporter.getByRole("button", { name: "Save fees" })).toHaveCount(0);

  const south = await (await browser.newContext()).newPage();
  await signIn(south, org.southEditor, org.slug);
  await south.goto("/checkouts");
  await expect(south.getByRole("link", { name: "Choir camp" })).toHaveCount(0);
  expect((await south.goto(secondUrl))?.status()).toBe(404);
});
