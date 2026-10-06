import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL, MAILPIT_URL, portalOrganization as o } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

// Lakeside North only, so the Lakeside request and band tests keep their recipients.
test.describe.configure({ mode: "serial" });

const northEditorName = "North Editor";

async function sentToFor(groupId: string) {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ to: string }>(
      `select u.username as to from pgboss.job j
       join "EquipmentRequest" r on r.id::text = j.data->'data'->>'requestId'
       join "User" u on u.id::text = j.data->'recipient'->>'userId'
       where j.name = 'email.send' and j.data->>'template' = 'request-sent'
         and r."guestGroupId" = $1`,
      [groupId],
    );
    return rows.map((row) => row.to).sort();
  } finally {
    await client.end();
  }
}

test("campus admins set a campus's default contact, and new groups and check-outs start with them", async ({
  page,
}) => {
  await signIn(page, o.admin, o.slug);
  await page.goto("/settings");
  await page.getByRole("link", { name: "Campuses" }).click();
  await page.locator(`#contact-${o.north.id}`).selectOption({ label: northEditorName });
  await page.getByRole("button", { name: `Save ${o.north.code} contact` }).click();
  await expect(
    page.getByText(`Done: ${northEditorName} is ${o.north.code}'s default contact.`),
  ).toBeVisible();

  await page.goto(`/guests/new?campus=${o.north.id}`);
  await expect(page.getByLabel("Staff contact").locator("option:checked")).toHaveText(
    northEditorName,
  );
  await page.goto(`/checkouts/new?campus=${o.north.id}`);
  await expect(page.getByLabel("Staff representative").locator("option:checked")).toHaveText(
    northEditorName,
  );
});

test("a group's request emails only the campus's default contact", async ({ page }) => {
  await page.goto(`/portal/${o.northGroup.token}/equipment`);
  await page.getByLabel("SM58", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Done: Sent your request for 1 item.")).toBeVisible();

  // Every recipient's email is queued at once, so the first one means they all are.
  await expect
    .poll(() => sentToFor(o.northGroup.id), { timeout: 20_000 })
    .toEqual([o.northEditor.username]);
  await expect(async () => {
    const query = encodeURIComponent(
      `to:${o.northEditor.username}@example.com subject:"North retreat"`,
    );
    const { messages } = (await (
      await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`)
    ).json()) as { messages: unknown[] };
    expect(messages.length).toBeGreaterThan(0);
  }).toPass({ timeout: 20_000 });
});
