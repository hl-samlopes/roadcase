import { expect, test, type Page } from "@playwright/test";
import { MAILPIT_URL, portalOrganization as o } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

// One request, from the group sending it through review to a draft check-out.
test.describe.configure({ mode: "serial" });

const portal = (group: { token: string }) => `/portal/${group.token}`;
const adminEmail = `${o.admin.username}@example.com`;

type Message = { ID: string; Subject: string; To: { Address: string }[] };

async function search(query: string): Promise<Message[]> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(query)}`);
  return ((await response.json()) as { messages: Message[] }).messages;
}

async function text(message: Message) {
  return (
    (await (await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`)).json()) as {
      Text: string;
    }
  ).Text;
}

function kindRow(page: Page, name: string) {
  return page.getByRole("listitem").filter({ has: page.getByLabel(name, { exact: true }) });
}

test.beforeAll(async () => {
  for (const address of [o.band.email, adminEmail]) {
    const query = encodeURIComponent(`to:${address} "Lakeside band"`);
    await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`, { method: "DELETE" });
  }
});

test("a sent request emails the people who can review it, and nobody else", async ({ page }) => {
  await page.goto(`${portal(o.band)}/equipment`);
  await page.getByLabel("SM58", { exact: true }).fill("2");
  await page.getByLabel("Beta 58", { exact: true }).fill("1");
  await page.getByLabel("Note to staff (optional)").fill("For the Saturday concert.");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Done: Sent your request for 3 items.")).toBeVisible();

  let staffMail: Message[] = [];
  await expect(async () => {
    staffMail = await search('subject:"Equipment request from Lakeside band"');
    expect(staffMail.map((m) => m.To[0].Address)).toContain(adminEmail);
  }).toPass({ timeout: 20_000 });
  const body = await text(staffMail.find((m) => m.To[0].Address === adminEmail)!);
  expect(body).toContain("2 × SM58");
  expect(body).toContain("/request");
  // The opted-out editor and the other campus's editor get nothing.
  const addresses = staffMail.map((m) => m.To[0].Address);
  expect(addresses).not.toContain(`${o.quietEditor.username}@example.com`);
  expect(addresses).not.toContain(`${o.northEditor.username}@example.com`);
});

test("staff partly approve it with notes, and the group sees the decision", async ({
  page,
  browser,
}) => {
  await signIn(page, o.admin, o.slug);
  await page.goto("/guests");
  await page.getByRole("link", { name: "Equipment requests" }).click();
  await expect(page.getByRole("heading", { name: "Equipment requests", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: o.band.name }).click();
  await expect(page.getByText("For the Saturday concert.")).toBeVisible();

  // Nothing overlaps the band's dates, so all 4 SM58 and both Beta 58s are free for them.
  const table = page.getByRole("table", { name: "Requested items" });
  await expect(table.getByRole("row", { name: /^SM58/ })).toContainText("4");
  await page.getByLabel("Approve how many SM58").fill("9");
  await page.getByRole("button", { name: "Send decision to the group" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Error:" })).toContainText(
    "SM58: Only 4 are free for the group's dates.",
  );

  await page.getByLabel("Approve how many SM58").fill("1");
  await page.getByLabel("Note to the group about SM58").fill("One is booked for chapel.");
  await page.getByLabel("Approve how many Beta 58").fill("1");
  await page.getByLabel("Message to the group (optional)").fill("See you on the 30th.");
  await page.getByRole("button", { name: "Send decision to the group" }).click();
  await expect(
    page.getByText(`Done: Partly approved. We emailed ${o.band.email} the decision.`),
  ).toBeVisible();

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(`${portal(o.band)}/equipment`);
  await expect(guestPage.getByText("Your request: Partly approved")).toBeVisible();
  await expect(
    guestPage.getByRole("row", { name: /SM58 2 1 One is booked for chapel\./ }),
  ).toBeVisible();
  await expect(guestPage.getByText("See you on the 30th.")).toBeVisible();
  await expect(guestPage.getByRole("button", { name: /Send/ })).toHaveCount(0);

  // The campers overlap the band's dates: the band's approved SM58 is held for it.
  await guestPage.goto(`${portal(o.campers)}/equipment`);
  await expect(kindRow(guestPage, "SM58")).toContainText("3 free for your dates");
  await guest.close();

  await expect(async () => {
    const [decision] = await search(`to:${o.band.email} subject:"partly approved"`);
    expect(decision).toBeDefined();
    const body = await text(decision);
    expect(body).toContain("SM58: 1 of 2 approved (One is booked for chapel.)");
    expect(body).toContain("1 × Beta 58");
  }).toPass({ timeout: 20_000 });
});

test("staff turn the approved request into a draft check-out with the items they choose", async ({
  page,
  browser,
}) => {
  await signIn(page, o.admin, o.slug);
  await page.goto(`/guests/${o.band.id}/request`);
  await page.getByRole("link", { name: "Create check-out draft" }).click();

  // The Beta 58 on the lodge rental and the SM58 needing repair can't be chosen; free ones are ticked.
  await expect(page.getByRole("checkbox", { disabled: true })).toHaveCount(2);
  await expect(page.getByText("Can't use: It's on check-out #1 (Lodge rental).")).toBeVisible();
  await expect(
    page.getByText("Can't use: Its condition, Needs repair, isn't available for check-out."),
  ).toBeVisible();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(2);

  await page.getByRole("button", { name: "Create draft check-out" }).click();
  await expect(page.getByText(/Done: draft check-out #\d+ created/)).toBeVisible();
  await expect(page.getByRole("link", { name: o.band.name })).toBeVisible();
  await expect(
    page.getByRole("definition").filter({ hasText: "From Lakeside band's equipment request." }),
  ).toBeVisible();
  await expect(page.getByText(/LKS-\d{6} SM58/)).toHaveCount(1);
  await expect(page.getByText(/LKS-\d{6} Beta 58/)).toHaveCount(1);

  // Now the check-out holds the SM58, not the request: still 3 for the campers, not 2.
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(`${portal(o.campers)}/equipment`);
  await expect(kindRow(guestPage, "SM58")).toContainText("3 free for your dates");
  await guest.close();

  await page.goto(`/guests/${o.band.id}/request`);
  await expect(page.getByText(/was made from this request/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reopen review" })).toHaveCount(0);
});

test("staff at another campus can't see or review the request", async ({ page }) => {
  await signIn(page, o.northEditor, o.slug);
  expect((await page.goto(`/guests/${o.band.id}/request`))?.status()).toBe(404);
  await page.goto("/guests/requests");
  await expect(page.getByRole("link", { name: o.band.name })).toHaveCount(0);
});

test("starting a review stops the group changing its request", async ({ page, browser }) => {
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(`${portal(o.campers)}/equipment`);
  await guestPage.getByLabel("SM58", { exact: true }).fill("1");
  await guestPage.getByRole("button", { name: "Send request" }).click();
  await expect(guestPage.getByText("Done: Sent your request for 1 item.")).toBeVisible();

  await signIn(page, o.admin, o.slug);
  await page.goto(`/guests/${o.campers.id}/request`);
  await page.getByLabel("Approve how many SM58").fill("1");
  await page.getByRole("button", { name: "Save without sending" }).click();
  await expect(
    page.getByText("Done: Saved. The group can no longer change its request."),
  ).toBeVisible();

  // The group's open page is now out of date: its save is refused, and a reload shows why.
  await guestPage.getByLabel("SM58", { exact: true }).fill("2");
  await guestPage.getByRole("button", { name: "Send changes" }).click();
  await expect(guestPage.getByRole("alert").filter({ hasText: "Error:" })).toContainText(
    "Staff have started reviewing your request",
  );
  await guestPage.reload();
  await expect(guestPage.getByText("Your request: Staff are reviewing it")).toBeVisible();
  // Staff's numbers stay private until they send the decision.
  await expect(guestPage.getByRole("columnheader", { name: "Approved" })).toHaveCount(0);
  await guest.close();
});

test("people who run check-outs can turn request emails off", async ({ page }) => {
  await signIn(page, o.quietEditor, o.slug);
  await page.goto("/account/preferences");
  const box = page.getByLabel(
    "A guest group sends or changes an equipment request where I run check-outs",
  );
  await expect(box).not.toBeChecked();
  await box.check();
  await page.getByRole("button", { name: "Save email preferences" }).click();
  await expect(page.getByText("Done: Email preferences saved.")).toBeVisible();
  await page.reload();
  await expect(box).toBeChecked();
});
