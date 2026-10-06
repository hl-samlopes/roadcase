import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL, portalOrganization as o } from "./fixtures.ts";

async function organizationId() {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      `select id from "Organization" where slug = $1`,
      [o.slug],
    );
    return rows[0].id;
  } finally {
    await client.end();
  }
}

test("branding files are public through Roadcase; nothing else in storage is", async ({
  request,
}) => {
  const org = await organizationId();
  const logo = await request.get(`/branding/${org}/logo-light-e2e.png`);
  expect(logo.status()).toBe(200);
  expect(logo.headers()["content-type"]).toBe("image/png");
  expect(logo.headers()["cache-control"]).toContain("public");

  // Item photos are in the same bucket, under items/: never reachable from here.
  for (const path of [
    `/branding/${org}/missing.png`,
    `/branding/..%2Fitems/${o.sm58PhotoId}.png`,
    `/branding/${org}/..%2F..%2Fitems`,
  ]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});
