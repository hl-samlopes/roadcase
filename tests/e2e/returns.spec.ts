import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL, harborOrganization as org, MAILPIT_URL } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

// One check-out comes back in two trips; the other is overdue.
test.describe.configure({ mode: "serial" });

const bandUrl = `/checkouts/${org.band.id}`;

async function scan(page: Page, code: string) {
  const field = page.getByLabel("Scan an item to tick it");
  await field.fill(code);
  await field.press("Enter");
}

test("items come back in two trips; only the damaged one gets a ticket", async ({ page }) => {
  await signIn(page, org.editor, org.slug);
  await page.goto(bandUrl);
  await expect(page.getByText("Out", { exact: true })).toBeVisible();

  // First trip: the mic, fine.
  await scan(page, org.mic.code.toLowerCase());
  await expect(page.getByText(`Ticked ${org.mic.code} ${org.mic.name}.`)).toBeVisible();
  await expect(page.getByLabel(`Check in ${org.mic.code} ${org.mic.name}`)).toBeChecked();
  await expect(page.getByLabel(`Check in ${org.amp.code} ${org.amp.name}`)).not.toBeChecked();
  // An item that isn't on this check-out is called out, not ticked.
  await scan(page, "HBR-999999");
  await expect(page.getByText("HBR-999999 isn't out on this check-out.")).toBeVisible();
  await page.getByRole("button", { name: "Check in ticked items" }).click();
  await expect(page.getByText("Done: Checked in 1 item. Some items are still out.")).toBeVisible();
  await expect(page.getByText("Partially returned", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("row", { name: new RegExp(`${org.amp.code}.*Not back yet`) }),
  ).toBeVisible();

  // Second trip: the amp, damaged.
  await scan(page, org.amp.code);
  await page
    .getByLabel(`Condition of ${org.amp.code} ${org.amp.name}`)
    .selectOption({ label: "Needs repair (opens a repair ticket)" });
  await page.getByLabel(`Notes on ${org.amp.code} ${org.amp.name}`).fill("Cracked case, hums");
  await page.getByRole("button", { name: "Check in ticked items" }).click();

  await expect(page.getByText("Returned", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Check items in" })).toHaveCount(0);
  const tickets = page.getByRole("region", { name: "Repair tickets from this check-out" }).or(
    page.locator("section").filter({
      has: page.getByRole("heading", { name: "Repair tickets from this check-out" }),
    }),
  );
  await expect(tickets.getByRole("listitem")).toHaveCount(1);
  await expect(tickets).toContainText(org.amp.code);

  // The full history, oldest first.
  const history = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "History", exact: true }) });
  await expect(history).toContainText("Checked in by Harbor Editor: 1 item");
  await expect(history).toContainText(`${org.mic.code} ${org.mic.name}: Good`);
  await expect(history).toContainText(
    `${org.amp.code} ${org.amp.name}: Needs repair. Cracked case, hums`,
  );
  await expect(history).toContainText(`Ticket #1 opened for ${org.amp.code}`);
  await expect(history.locator(":scope > ol > li").last()).toContainText("Everything is back");

  // The ticket carries the return notes and links back.
  await tickets.getByRole("link").click();
  await expect(page).toHaveURL(/\/tickets\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: /^#1 Needs repair on return from check-out #1/ }),
  ).toBeVisible();
  await expect(page.getByText("Cracked case, hums")).toBeVisible();
  await expect(
    page.getByRole("link", { name: `Check-out #${org.band.number} (${org.band.group})` }),
  ).toBeVisible();

  // Items took their returned condition and are free for other check-outs.
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ code: string; label: string; holds: boolean }>(
      `select i.code, c.label, l."holdsItem" as holds from "CheckoutLine" l
       join "Item" i on i.id = l."itemId" join "ItemCondition" c on c.id = i."conditionId"
       where l."checkoutId" = $1 order by i.code`,
      [org.band.id],
    );
    expect(rows).toEqual([
      { code: org.mic.code, label: "Good", holds: false },
      { code: org.amp.code, label: "Needs repair", holds: false },
    ]);
  } finally {
    await client.end();
  }
});

test("overdue check-outs are flagged and their staff rep is reminded", async ({ page }) => {
  await signIn(page, org.editor, org.slug);
  await page.goto("/checkouts");
  await page.getByRole("link", { name: "Overdue", exact: true }).click();
  const row = page.getByRole("row", { name: new RegExp(org.sailing.group) });
  await expect(row).toBeVisible();
  await expect(row.getByText("Overdue", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: org.band.group })).toHaveCount(0);

  await row.getByRole("link", { name: org.sailing.group }).click();
  await expect(
    page.getByText(/Overdue: due back .*, 1 day ago\. 1 item is still out\./),
  ).toBeVisible();

  // The worker's first scan queued a reminder to the staff representative.
  const query = encodeURIComponent(`to:${org.editor.username}@example.com`);
  await expect
    .poll(
      async () => {
        const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
        const { messages } = (await response.json()) as { messages: { Subject: string }[] };
        return messages.map((m) => m.Subject);
      },
      { timeout: 30_000 },
    )
    .toContainEqual(
      expect.stringContaining(`Overdue: check-out #${org.sailing.number} (${org.sailing.group})`),
    );
});
