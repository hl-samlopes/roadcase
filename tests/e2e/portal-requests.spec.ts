import { expect, test, type Page } from "@playwright/test";
import { MAILPIT_URL, portalOrganization as o } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

const portal = (group: { token: string }) => `/portal/${group.token}`;

function kindRow(page: Page, name: string) {
  return page.getByRole("listitem").filter({ has: page.getByLabel(name, { exact: true }) });
}

test.beforeAll(async () => {
  const query = encodeURIComponent(`to:${o.youth.email}`);
  await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`, { method: "DELETE" });
});

test("a group sees only what it can request for its dates, then builds, sends, changes and withdraws a request", async ({
  page,
  browser,
}) => {
  await page.goto(portal(o.youth));
  await page.getByRole("link", { name: "Request equipment" }).click();
  await expect(page.getByRole("heading", { name: "Equipment", level: 1 })).toBeVisible();

  // Portal categories only, and only kinds with items in a condition that can go out.
  await expect(page.getByRole("heading", { name: "Microphones" })).toBeVisible();
  await expect(page.getByText(o.micsDescription)).toBeVisible();
  for (const hidden of ["Lighting", "Cables", "Par can", "XLR cable"]) {
    await expect(page.getByText(hidden, { exact: true })).toHaveCount(0);
  }
  // One SM58 is reserved by an approved request and one Beta 58 by a check-out, both overlapping.
  await expect(kindRow(page, "SM58")).toContainText("3 free for your dates");
  await expect(kindRow(page, "Beta 58")).toContainText("1 free for your dates");

  // The SM58's photo loads through the portal; the Lighting item's never does.
  const src = await kindRow(page, "SM58").locator("img").getAttribute("src");
  const photo = await page.request.get(src!);
  expect(photo.status()).toBe(200);
  expect(photo.headers()["content-type"]).toBe("image/png");
  expect((await page.request.get(`${portal(o.youth)}/photos/${o.hiddenPhotoId}`)).status()).toBe(
    404,
  );

  // More than is free is refused.
  await page.getByLabel("SM58", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Error:" })).toContainText(
    "SM58: Only 3 are free for your dates.",
  );

  // Saved, not sent: staff can't see what's in it.
  await page.getByLabel("SM58", { exact: true }).fill("2");
  await page.getByLabel("Beta 58", { exact: true }).fill("1");
  await page.getByLabel("Note to staff (optional)").fill("Mics for the evening sessions.");
  await page.getByRole("button", { name: "Save for later" }).click();
  await expect(page.getByText("Done: Saved 3 items for later.")).toBeVisible();
  await expect(page.getByText("Your request: Saved, not sent yet")).toBeVisible();

  const staff = await browser.newContext();
  const staffPage = await staff.newPage();
  await signIn(staffPage, o.admin, o.slug);
  await staffPage.goto(`/guests/${o.youth.id}`);
  await expect(
    staffPage.getByText("The group has started a request but hasn't sent it yet."),
  ).toBeVisible();
  await expect(staffPage.getByText("2 × SM58")).toHaveCount(0);

  // Sent: the group gets a copy by email, and staff see it.
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Done: Sent your request for 3 items.")).toBeVisible();
  await expect(page.getByText("Your request: Sent: waiting for staff")).toBeVisible();
  await expect(async () => {
    const query = encodeURIComponent(`to:${o.youth.email} subject:"equipment request"`);
    const { messages } = (await (
      await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`)
    ).json()) as { messages: { ID: string }[] };
    expect(messages.length).toBeGreaterThan(0);
    const message = (await (
      await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`)
    ).json()) as { Text: string };
    expect(message.Text).toContain("2 × SM58");
    expect(message.Text).toContain("1 × Beta 58");
    expect(message.Text).toContain(portal(o.youth));
  }).toPass({ timeout: 20_000 });
  await staffPage.reload();
  await expect(staffPage.getByText("2 × SM58")).toBeVisible();
  await expect(staffPage.getByText("Mics for the evening sessions.")).toBeVisible();

  // Changes go straight to staff while they haven't started.
  await page.reload();
  await expect(page.getByLabel("SM58", { exact: true })).toHaveValue("2");
  await page.getByLabel("SM58", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Send changes" }).click();
  await expect(page.getByText("Done: Sent your changes (4 items).")).toBeVisible();

  await page.getByRole("button", { name: "Withdraw request" }).click();
  await expect(page.getByText("Your request: Withdrawn")).toBeVisible();
  await staffPage.reload();
  await expect(staffPage.getByText("Withdrawn", { exact: true })).toBeVisible();
  await expect(staffPage.getByText("3 × SM58")).toBeVisible();
  await staff.close();
});

test("another group's dates and link see their own catalog, never the first group's request", async ({
  page,
}) => {
  await page.goto(portal(o.choir));
  await expect(page.getByRole("link", { name: "Request equipment" })).toBeVisible();
  await page.goto(`${portal(o.choir)}/equipment`);
  // Nothing overlaps the choir's dates.
  await expect(kindRow(page, "SM58")).toContainText("4 free for your dates");
  await expect(kindRow(page, "Beta 58")).toContainText("2 free for your dates");
  await expect(page.getByText("Your request:")).toHaveCount(0);
  await expect(page.getByLabel("SM58", { exact: true })).toHaveValue("");
});

test("an approved request can't be changed from the portal", async ({ page }) => {
  await page.goto(`${portal(o.retreat)}/equipment`);
  await expect(page.getByText("Your request: Approved")).toBeVisible();
  await expect(page.getByRole("cell", { name: "SM58" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Send/ })).toHaveCount(0);
});

test("organization admins choose which categories guests see", async ({ page, browser }) => {
  await signIn(page, o.admin, o.slug);
  await page.goto("/settings/categories");
  const table = page.getByRole("table", { name: "Categories" });
  await expect(table.getByRole("row", { name: /^Staging/ })).toContainText("Hidden");
  await table.getByRole("button", { name: "Edit Staging" }).click();
  await table.getByLabel("Show in guest portal").check();
  await table.getByLabel("Description for guests").fill("Risers and stage decks.");
  await table.getByRole("button", { name: "Save guest portal settings for Staging" }).click();
  await expect(page.getByText("Done: Guests now see Staging in the portal.")).toBeVisible();

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(`${portal(o.choir)}/equipment`);
  await expect(guestPage.getByRole("heading", { name: "Staging" })).toBeVisible();
  await expect(guestPage.getByText("Risers and stage decks.")).toBeVisible();
  await expect(kindRow(guestPage, "Riser")).toContainText("1 free for your dates");
  await guest.close();
});
