import { expect, test } from "@playwright/test";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { accounts, E2E_ADMIN_EMAIL, E2E_DATABASE_URL, MAILPIT_URL } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

async function organizationId(slug: string) {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      `select id from "Organization" where slug = $1`,
      [slug],
    );
    return rows[0].id;
  } finally {
    await client.end();
  }
}

async function mailpit<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/${path}`, init);
  if (!response.ok) throw new Error(`Mailpit ${path}: HTTP ${response.status}`);
  return (init?.method === "DELETE" ? undefined : await response.json()) as T;
}

test("a failing job retries until it works, and admins see each failed attempt", async ({
  page,
}) => {
  const boss = new PgBoss({
    connectionString: E2E_DATABASE_URL,
    schema: "pgboss",
    supervise: false,
    schedule: false,
  });
  await boss.start();
  try {
    const orgId = await organizationId("hume");
    // Fails once, then succeeds on the first retry.
    const recovers = await boss.send("test.flaky", { organizationId: orgId, failAttempts: 1 });
    // Fails more often than the queue retries (2), so it gives up after 3 attempts.
    const givesUp = await boss.send("test.flaky", { organizationId: orgId, failAttempts: 5 });

    await expect
      .poll(async () => (await boss.getJobById("test.flaky", recovers!))?.state, {
        timeout: 30_000,
      })
      .toBe("completed");
    await expect
      .poll(async () => (await boss.getJobById("test.flaky", givesUp!))?.state, {
        timeout: 30_000,
      })
      .toBe("failed");
  } finally {
    await boss.stop({ graceful: false });
  }

  await signIn(page, accounts.admin);
  await page.goto("/settings");
  await page.getByRole("link", { name: "Notifications" }).click();
  const failures = page.getByRole("table");
  await expect(failures.getByRole("row", { name: /Test job 1 Will retry/ }).first()).toBeVisible();
  await expect(failures.getByRole("row", { name: /Test job 3 Gave up/ })).toBeVisible();
  await expect(failures.getByText("Test job failed attempt 3 on purpose")).toBeVisible();
});

test("an admin sends a branded test email through the worker", async ({ page }) => {
  await mailpit(`search?query=${encodeURIComponent(`to:${E2E_ADMIN_EMAIL}`)}`, {
    method: "DELETE",
  });

  await signIn(page, accounts.admin);
  await page.goto("/settings/notifications");
  await page.getByRole("button", { name: "Send a test email to me" }).click();
  await expect(page.getByText(`Done: Test email queued to ${E2E_ADMIN_EMAIL}.`)).toBeVisible();

  type Search = { messages: { ID: string; Subject: string; From: { Name: string } }[] };
  let found: Search["messages"] = [];
  await expect
    .poll(
      async () => {
        found = (
          await mailpit<Search>(`search?query=${encodeURIComponent(`to:${E2E_ADMIN_EMAIL}`)}`)
        ).messages;
        return found.length;
      },
      { timeout: 30_000 },
    )
    .toBe(1);
  expect(found[0].Subject).toBe("Test email from Roadcase");
  expect(found[0].From.Name).toBe("Roadcase");

  const message = await mailpit<{ HTML: string; Text: string }>(`message/${found[0].ID}`);
  expect(message.Text).toContain("Email is working");
  expect(message.Text).toContain("E2E Admin sent this test");
  // Roadcase's default light background, so the organization's colors are applied.
  expect(message.HTML).toContain("background:#F6F7F9");
});

test("only organization admins can open Notifications", async ({ page }) => {
  await signIn(page, accounts.meadowRanchEditor);
  expect((await page.goto("/settings/notifications"))?.status()).toBe(404);
});
