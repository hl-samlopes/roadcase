import { expect, test, type Page } from "@playwright/test";
import { accounts, MAILPIT_URL } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

// Unique per run, so reruns against the same Mailpit never see old mail.
const run = Date.now().toString(36);

type Message = { ID: string; Subject: string };

async function portalLinkFromEmail(address: string): Promise<string> {
  const query = encodeURIComponent(`to:${address}`);
  let message: Message | undefined;
  await expect(async () => {
    const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
    [message] = ((await response.json()) as { messages: Message[] }).messages;
    expect(message).toBeDefined();
  }).toPass({ timeout: 20_000 });
  const full = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${message!.ID}`)).json()) as {
    Text: string;
  };
  const link = full.Text.match(/https?:\/\/\S+\/portal\/[A-Za-z0-9_-]{43}/)?.[0];
  expect(link, "the email carries a portal link").toBeTruthy();
  return new URL(link!).pathname;
}

function day(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function createGroup(page: Page, name: string, email: string, from: number, to: number) {
  await page.goto("/guests");
  await page.getByRole("link", { name: "New guest group" }).click();
  await page.getByLabel("Group name").fill(name);
  await page.getByLabel("Name", { exact: true }).fill("Riley Rep");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Phone").fill("(555) 010-2000");
  await page.getByLabel("Staff contact").selectOption({ index: 1 });
  await page.getByLabel("Arrives").fill(day(from));
  await page.getByLabel("Leaves").fill(day(to));
  await page.getByRole("button", { name: "Save guest group" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

test("staff send a portal link, the group opens it without an account, and old links stop working", async ({
  page,
  browser,
}) => {
  const name = `Youth band ${run}`;
  const email = `portal-${run}@example.com`;
  await signIn(page, accounts.admin);
  await createGroup(page, name, email, 3, 5);
  await expect(page.getByText("No link yet")).toBeVisible();

  await page.getByRole("button", { name: `Email a new link to ${email}` }).click();
  await expect(page.getByText(`Done: Sent a new portal link to ${email}.`)).toBeVisible();
  const emailed = await portalLinkFromEmail(email);

  // A guest: no session at all.
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  const response = await guestPage.goto(emailed);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(guestPage.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(guestPage.getByText("Riley Rep")).toBeVisible();
  // Nothing from the staff app.
  await expect(guestPage.getByRole("navigation")).toHaveCount(0);

  // Staff see it was opened.
  await page.reload();
  await expect(page.getByText(/Last opened/)).toBeVisible();
  await expect(page.getByText("Link works", { exact: true })).toBeVisible();

  // A copied link replaces the emailed one.
  await page.getByRole("button", { name: "Make a new link to copy" }).click();
  const copied = new URL(await page.getByLabel("Portal link").inputValue()).pathname;
  expect(copied).not.toBe(emailed);
  expect((await guestPage.goto(emailed))?.status()).toBe(404);
  await expect(guestPage.getByRole("heading", { name: "This link doesn't work" })).toBeVisible();
  expect((await guestPage.goto(copied))?.status()).toBe(200);

  // An altered link never works.
  const altered = copied.slice(0, -1) + (copied.endsWith("A") ? "B" : "A");
  expect((await guestPage.goto(altered))?.status()).toBe(404);

  // Turning it off.
  await page.getByRole("button", { name: "Turn off the link" }).click();
  await expect(page.getByText(/The last link was turned off/)).toBeVisible();
  expect((await guestPage.goto(copied))?.status()).toBe(404);
  await guest.close();
});

test("archiving a group turns its link off, and past groups can't get new links", async ({
  page,
  browser,
}) => {
  await signIn(page, accounts.admin);
  await createGroup(page, `Retreat ${run}`, `retreat-${run}@example.com`, 1, 2);
  await page.getByRole("button", { name: "Make a new link to copy" }).click();
  const link = new URL(await page.getByLabel("Portal link").inputValue()).pathname;
  await page.getByRole("button", { name: "Archive this group" }).click();
  await expect(
    page.getByText("This group is archived. Its portal link doesn't work."),
  ).toBeVisible();
  const guest = await browser.newContext();
  expect((await (await guest.newPage()).goto(link))?.status()).toBe(404);
  await guest.close();

  // Left 30 days ago: a new link would already be expired.
  await createGroup(page, `Spring camp ${run}`, `spring-${run}@example.com`, -32, -30);
  await page.getByRole("button", { name: "Make a new link to copy" }).click();
  await expect(page.getByText(/dates have passed/)).toBeVisible();
  await page.goto("/guests?view=past");
  await expect(page.getByRole("link", { name: `Spring camp ${run}` })).toBeVisible();
});

test("a check-out made from a group starts with its details and links back", async ({ page }) => {
  const name = `Worship team ${run}`;
  await signIn(page, accounts.admin);
  await createGroup(page, name, `worship-${run}@example.com`, 2, 4);
  await page.getByRole("link", { name: "New check-out for this group" }).click();
  await expect(page.getByLabel("Guest group")).toHaveValue(name);
  await expect(page.getByLabel("Date out")).toHaveValue(day(2));
  await page.getByRole("button", { name: "Create draft check-out" }).click();
  await expect(page.getByText(/Done: draft check-out #\d+ created/)).toBeVisible();
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("link", { name: /Check-out #\d+/ })).toBeVisible();
});

test("too many bad links from one address locks that address out", async ({ page, browser }) => {
  await signIn(page, accounts.admin);
  await createGroup(page, `Choir ${run}`, `choir-${run}@example.com`, 1, 3);
  await page.getByRole("button", { name: "Make a new link to copy" }).click();
  const link = new URL(await page.getByLabel("Portal link").inputValue()).pathname;

  const guessing = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` },
  });
  for (let i = 0; i < 30; i++) {
    const guess = `/portal/${"x".repeat(40)}${i.toString().padStart(3, "0")}`;
    expect((await guessing.request.get(guess)).status()).toBe(404);
  }
  // Even the real link is refused from there now, but still works elsewhere.
  expect((await guessing.request.get(link)).status()).toBe(404);
  const elsewhere = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": "203.0.113.77" },
  });
  expect((await elsewhere.request.get(link)).status()).toBe(200);
  await guessing.close();
  await elsewhere.close();
});

test("only people who run check-outs at a campus manage its guest groups", async ({ page }) => {
  // Meadow Ranch editor: a location grant, narrower than a campus.
  await signIn(page, accounts.meadowRanchEditor);
  await page.goto("/guests");
  await expect(page.getByRole("heading", { name: "Guest portal" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New guest group" })).toHaveCount(0);
  expect((await page.goto("/guests/new"))?.status()).toBe(404);
});
