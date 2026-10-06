import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import {
  E2E_DATABASE_URL,
  FAKE_SLACK_URL,
  MAILPIT_URL,
  notifyOrganization as org,
} from "./fixtures.ts";
import { openUserMenu, signIn } from "./helpers.ts";

// One flow: set up Slack, open a ticket, then check who heard about it.
test.describe.configure({ mode: "serial" });

const address = (account: { username: string }) => `${account.username}@example.com`;
const everyone = [org.admin, org.editor, org.optedOut, org.reporter, org.southEditor];

type Message = { ID: string; Subject: string };

async function inbox(account: { username: string }): Promise<Message[]> {
  const query = encodeURIComponent(`to:${address(account)}`);
  const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
  return ((await response.json()) as { messages: Message[] }).messages;
}

async function slackPosts(path: string) {
  const response = await fetch(`${FAKE_SLACK_URL}/__posts`);
  const posts = (await response.json()) as { path: string; body: { text: string } }[];
  return posts.filter((post) => post.path === path);
}

/** Ticket email jobs not yet finished (queued, waiting to retry, or running). Other specs send other emails at the same time. */
async function pendingEmailJobs() {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ count: string }>(
      `select count(*) from pgboss.job where name = 'email.send' and data->>'template' = 'ticket' and state in ('created', 'retry', 'active')`,
    );
    return Number(rows[0].count);
  } finally {
    await client.end();
  }
}

async function openNotifications(page: Page) {
  await signIn(page, org.admin, org.slug);
  await page.goto("/settings");
  await page.getByRole("link", { name: "Notifications" }).click();
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
}

test.beforeAll(async () => {
  for (const account of everyone) {
    const query = encodeURIComponent(`to:${address(account)}`);
    await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`, { method: "DELETE" });
  }
});

test("an admin connects a campus Slack channel and sends a test message", async ({ page }) => {
  await openNotifications(page);
  const hookUrl = `${FAKE_SLACK_URL}/hook/signal-north`;
  await page
    .getByLabel("Alerts for")
    .selectOption({ label: `${org.north.name} (${org.north.code})` });
  await page.getByLabel("Channel name").fill("#signal-north");
  await page.getByLabel("Webhook URL").fill(hookUrl);
  await page.getByRole("button", { name: "Add Slack channel" }).click();
  await expect(
    page.getByText("Done: Ticket alerts for Signal North campus will post to #signal-north."),
  ).toBeVisible();

  // The URL is a secret: only its last characters show after saving.
  const row = page.getByRole("row", { name: /#signal-north/ });
  await expect(row.getByText("…orth")).toBeVisible();
  expect(await page.content()).not.toContain(hookUrl);

  // A second channel for the same campus is refused.
  await page
    .getByLabel("Alerts for")
    .selectOption({ label: `${org.north.name} (${org.north.code})` });
  await page.getByLabel("Channel name").fill("#again");
  await page.getByLabel("Webhook URL").fill(`${FAKE_SLACK_URL}/hook/again`);
  await page.getByRole("button", { name: "Add Slack channel" }).click();
  await expect(page.getByText("already has a Slack webhook")).toBeVisible();

  // Only Slack's own addresses are accepted.
  await page.getByLabel("Webhook URL").fill("http://169.254.169.254/latest");
  await page.getByRole("button", { name: "Add Slack channel" }).click();
  await expect(page.getByText(/Paste the webhook URL from Slack/).first()).toBeVisible();

  await row.getByRole("button", { name: "Send test message to #signal-north" }).click();
  await expect(row.getByText("Done: Test message queued for #signal-north.")).toBeVisible();
  await expect
    .poll(async () => (await slackPosts("/hook/signal-north")).map((p) => p.body.text), {
      timeout: 20_000,
    })
    .toContain("Test message from Roadcase");
});

test("opening a ticket emails the editors who can see it and posts to Slack", async ({ page }) => {
  await signIn(page, org.reporter, org.slug);
  await page.goto(`/items/${org.item.id}`);
  await page.getByRole("link", { name: "Report a problem" }).click();
  await page.getByLabel("Problem").fill("Channel 6 crackles");
  await page.getByLabel("Details").fill("Only when the stage box is warm.");
  await page.getByRole("button", { name: "Submit ticket" }).click();
  await expect(page.getByText(/Done: ticket #1 submitted\./)).toBeVisible();

  const subject = "#1 opened: Channel 6 crackles";
  for (const account of [org.editor, org.admin]) {
    await expect
      .poll(async () => (await inbox(account)).map((m) => m.Subject), { timeout: 30_000 })
      .toContain(subject);
  }
  await expect
    .poll(async () => (await slackPosts("/hook/signal-north")).map((p) => p.body.text), {
      timeout: 20_000,
    })
    .toContain(subject);

  // Opted out, can't see the ticket, or opened it themselves: nothing, even
  // once every queued email has been sent.
  await expect.poll(pendingEmailJobs, { timeout: 30_000 }).toBe(0);
  for (const account of [org.optedOut, org.southEditor, org.reporter]) {
    // Only this ticket's email matters; the same people get other email from other specs.
    const aboutTicket = (await inbox(account)).filter((m) =>
      m.Subject.includes("Channel 6 crackles"),
    );
    expect(aboutTicket, account.username).toHaveLength(0);
  }

  // The email links to the ticket and carries the details; Slack doesn't.
  const message = (await inbox(org.editor)).find((m) => m.Subject === subject)!;
  const detail = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`)).json()) as {
    Text: string;
  };
  expect(detail.Text).toContain("Signal Reporter reported a problem with SGN-000001 Stage box");
  expect(detail.Text).toContain("Only when the stage box is warm.");
  expect(detail.Text).toMatch(/Open ticket #1: http:\/\/localhost:3100\/tickets\/[0-9a-f-]{36}/);
  const posted = JSON.stringify(await slackPosts("/hook/signal-north"));
  expect(posted).not.toContain("Only when the stage box is warm.");
});

test("a Slack post that fails retries and shows to organization admins", async ({ page }) => {
  await openNotifications(page);
  await page.getByLabel("Alerts for").selectOption({ label: "Production" });
  await page.getByLabel("Channel name").fill("#broken");
  await page.getByLabel("Webhook URL").fill(`${FAKE_SLACK_URL}/hook/fail`);
  await page.getByRole("button", { name: "Add Slack channel" }).click();
  await expect(page.getByText("Done: Ticket alerts for Production department")).toBeVisible();
  await page.getByRole("button", { name: "Send test message to #broken" }).click();

  await expect
    .poll(
      async () => {
        await page.reload();
        return page
          .getByRole("row", {
            name: /Post to Slack 1 Will retry Slack rejected the message \(HTTP 500\)/,
          })
          .count();
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
});

test("people turn ticket emails off in Preferences", async ({ page }) => {
  await signIn(page, org.editor, org.slug);
  await openUserMenu(page);
  await page.getByRole("link", { name: "Preferences" }).click();
  const box = page.getByLabel("A ticket opens for equipment I manage");
  await expect(box).toBeChecked();
  await box.uncheck();
  await page.getByRole("button", { name: "Save email preferences" }).click();
  await expect(page.getByText("Done: Email preferences saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("A ticket opens for equipment I manage")).not.toBeChecked();
  await expect(page.getByLabel("A ticket I reported is completed")).toBeChecked();
});
