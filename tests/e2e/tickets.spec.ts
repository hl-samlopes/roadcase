import { expect, test, type Page } from "@playwright/test";
import { accounts, existingTicket, items } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

const files = "tests/e2e/files";

function card(page: Page, title: string) {
  return page.locator("section", { has: page.getByRole("heading", { name: title, exact: true }) });
}

test("the full flow: flag an item, work the ticket, complete it into a service log", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  // 1. An editor sets the item to a condition that starts a repair ticket.
  // A US time zone, where the UTC date is often already tomorrow.
  const editor = await (await browser.newContext({ timezoneId: "America/Los_Angeles" })).newPage();
  await signIn(editor, accounts.meadowRanchEditor);
  await editor.goto(`/items/${items.speaker.id}/edit`);
  await editor.getByLabel("Condition").selectOption({ label: "Needs repair" });
  await editor.getByRole("button", { name: "Save item" }).click();
  const flash = editor.getByRole("status").filter({ hasText: "Repair ticket #" });
  await expect(flash).toBeVisible();
  const number = /#(\d+)/.exec((await flash.textContent()) ?? "")?.[1];
  expect(number).toBeDefined();

  await card(editor, "Tickets")
    .getByRole("link", { name: `#${number} Condition set to Needs repair` })
    .click();
  await expect(
    editor.getByRole("heading", { name: `#${number} Condition set to Needs repair` }),
  ).toBeVisible();
  const ticketUrl = editor.url();
  await expect(editor.getByText("Open", { exact: true }).first()).toBeVisible();

  // 2. A commenter can add information but not manage the ticket.
  const commenter = await (await browser.newContext()).newPage();
  await signIn(commenter, accounts.commenter);
  await commenter.goto(ticketUrl);
  await commenter.getByLabel("Comment").fill("Left channel crackles above half volume.");
  await commenter.getByRole("button", { name: "Add comment" }).click();
  await expect(commenter.getByText("Left channel crackles above half volume.")).toBeVisible();
  await expect(card(commenter, "Assign")).toHaveCount(0);
  await expect(card(commenter, "Complete")).toHaveCount(0);

  // 3. The editor assigns it to an outside company and moves it along.
  await editor.reload();
  await expect(editor.getByText("Left channel crackles above half volume.")).toBeVisible();
  const assign = card(editor, "Assign");
  await assign.getByLabel("An outside company").check();
  // Only the outside company's fields show once that's chosen.
  await expect(assign.getByLabel("Person", { exact: true })).toHaveCount(0);
  await expect(assign.getByLabel("Department", { exact: true })).toHaveCount(0);
  await assign.getByLabel("Company", { exact: true }).fill("Acme Audio Repair");
  await assign.getByLabel("Contact").fill("555-0100");
  await assign.getByRole("button", { name: "Save assignment" }).click();
  await expect(
    editor.getByText("Done: Assigned to Acme Audio Repair (outside company)."),
  ).toBeVisible();
  await expect(editor.getByText("Assigned", { exact: true }).first()).toBeVisible();

  await card(editor, "Status").getByLabel("Status").selectOption({ label: "In progress" });
  await card(editor, "Status").getByRole("button", { name: "Update status" }).click();
  await expect(editor.getByText("from Assigned to In progress")).toBeVisible();

  // 4. Completing records the service log and sets the item back to Good.
  const complete = card(editor, "Complete");
  const localToday = await editor.evaluate(() => new Date().toLocaleDateString("en-CA"));
  await expect(complete.getByLabel("Service date")).toHaveValue(localToday);
  await complete.getByLabel("Service type").fill("Repair");
  await complete.getByLabel("Cost").fill("45.50");
  await complete.getByLabel("Service notes").fill("Replaced the left driver.");
  await expect(complete.getByLabel("Item condition afterwards")).toHaveValue(/.+/);
  await complete.getByLabel("Receipt or report").setInputFiles(`${files}/manual.pdf`);
  await complete.getByRole("button", { name: "Complete ticket" }).click();
  await expect(editor.getByText("Completed", { exact: true }).first()).toBeVisible();
  const log = card(editor, "Service log");
  await expect(log.getByText("$45.50")).toBeVisible();
  await expect(log.getByText("Replaced the left driver.")).toBeVisible();
  await expect(log.getByRole("link", { name: "manual.pdf" })).toBeVisible();
  await expect(card(editor, "Complete")).toHaveCount(0);

  await editor.goto(`/items/${items.speaker.id}`);
  await expect(editor.getByText("Good", { exact: true })).toBeVisible();
  const history = card(editor, "Service history");
  await expect(history.getByText("Replaced the left driver.")).toBeVisible();
  await expect(history.getByRole("link", { name: `#${number}` })).toBeVisible();

  // 5. The service log page lists it with a cost total for the filter.
  await editor.goto("/service-log");
  await editor.getByLabel("Location").selectOption({ label: "Meadow Ranch (HLK)" });
  await editor.getByRole("button", { name: "Apply filters" }).click();
  await expect(editor.getByText("Total cost $45.50")).toBeVisible();
  await expect(
    editor.getByRole("link", { name: `${items.speaker.code} ${items.speaker.name}` }),
  ).toBeVisible();
});

test("a viewer with ticket submission reports a problem and comments only on their own tickets", async ({
  page,
}) => {
  await signIn(page, accounts.ticketSubmitter);
  await page.goto(`/items/${items.desk.id}`);
  await expect(page.getByRole("link", { name: "Edit item" })).toHaveCount(0);
  await page.getByRole("link", { name: "Report a problem" }).click();
  await page.getByLabel("Problem").fill("Fader 3 is dead");
  await page.getByLabel("Details").fill("No output on channel 3 since Sunday.");
  await page.getByLabel("Photo or document").setInputFiles(`${files}/speaker.png`);
  await page.getByRole("button", { name: "Submit ticket" }).click();
  await expect(page.getByText(/Done: ticket #\d+ submitted\./)).toBeVisible();
  await expect(page.getByRole("link", { name: "speaker.png" })).toBeVisible();
  await expect(card(page, "Assign")).toHaveCount(0);

  await page.getByLabel("Comment").fill("It is the one nearest the master fader.");
  await page.getByRole("button", { name: "Add comment" }).click();
  await expect(page.getByText("It is the one nearest the master fader.")).toBeVisible();

  // Someone else's ticket: readable, but no comment box.
  await page.goto(`/tickets/${existingTicket.id}`);
  await expect(page.getByRole("heading", { name: `#1 ${existingTicket.title}` })).toBeVisible();
  await expect(page.getByLabel("Comment")).toHaveCount(0);
});

test("tickets outside someone's scope are hidden from the queue and 404 by URL", async ({
  page,
}) => {
  await signIn(page, accounts.meadowRanchEditor);
  await page.goto("/tickets?status=all");
  await expect(page.getByText(existingTicket.title)).toHaveCount(0);
  expect((await page.goto(`/tickets/${existingTicket.id}`))?.status()).toBe(404);
});

test("plain viewers can't report problems", async ({ page }) => {
  await signIn(page, accounts.campusSwitcher);
  await page.goto(`/items/${items.desk.id}`);
  await expect(page.getByRole("link", { name: "Report a problem" })).toHaveCount(0);
  await page.goto(`/tickets/new?item=${items.desk.id}`);
  await expect(
    page.getByText("You can see this item but can't submit tickets for it."),
  ).toBeVisible();
});

test("an admin cancels and reopens a ticket; the queue filters by status", async ({ page }) => {
  await signIn(page, accounts.admin);
  await page.goto("/tickets");
  await page.getByRole("link", { name: existingTicket.title }).click();
  await card(page, "Cancel").getByLabel("Reason").fill("Loose cable, fixed on the spot.");
  await card(page, "Cancel").getByRole("button", { name: "Cancel ticket" }).click();
  await expect(page.getByText("Loose cable, fixed on the spot.")).toBeVisible();
  await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();

  await page.goto("/tickets");
  await expect(page.getByRole("link", { name: existingTicket.title })).toHaveCount(0);
  await page.getByLabel("Status").selectOption("closed");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page.getByRole("link", { name: existingTicket.title }).click();

  await page.getByRole("button", { name: "Reopen ticket" }).click();
  await expect(page.getByText("from Cancelled to Open")).toBeVisible();
});
