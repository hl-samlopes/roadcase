import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { MAILPIT_URL, portalOrganization as o } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

// One band, from the group describing it through staff adjusting and sharing its input list.
test.describe.configure({ mode: "serial" });

const portal = `/portal/${o.worship.token}`;
const staffBandPage = `/guests/${o.worship.id}/band`;

async function addPlayers(page: Page, position: string, count: number, notes: string[] = []) {
  for (let i = 0; i < count; i++) {
    await page.getByRole("button", { name: `Add ${position.toLowerCase()}`, exact: true }).click();
    if (notes[i]) {
      await page.getByLabel(`${position} ${i + 1}: name or note (optional)`).fill(notes[i]);
    }
  }
}

/** The PDF's subject: "N channels: 1 Source; 2 Source; ...". */
async function pdfSubject(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  const raw = Buffer.from(await response.body()).toString("latin1");
  // The subject is a PDF literal string, inline or in an object it points to
  // ("/Subject 19 0 R"); parentheses and backslashes in it are escaped.
  const ref = /\/Subject (\d+) 0 R/.exec(raw);
  const from = ref ? raw.indexOf(`\n${ref[1]} 0 obj`) : raw.indexOf("/Subject (");
  const start = raw.indexOf("(", from) + 1;
  let subject = "";
  for (let i = start; i < raw.length && raw[i] !== ")"; i++) {
    subject += raw[i] === "\\" ? raw[++i] : raw[i];
  }
  return subject;
}

/** The sources in the staff editor, top to bottom. */
async function editorSources(page: Page) {
  const count = await page.getByLabel(/^Channel \d+ source$/).count();
  const sources: string[] = [];
  for (let i = 1; i <= count; i++) {
    sources.push(await page.getByLabel(`Channel ${i} source`, { exact: true }).inputValue());
  }
  return sources;
}

test.beforeAll(async () => {
  const query = encodeURIComponent('subject:"Band setup from Lakeside worship"');
  await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`, { method: "DELETE" });
});

test("a group describes its band and gets a 13-channel input list", async ({ page }) => {
  await page.goto(portal);
  await page.getByRole("link", { name: "Describe your band" }).click();
  await addPlayers(page, "Vocal", 2, ["Lead vocal, wireless if possible"]);
  await addPlayers(page, "Electric guitar", 1);
  await addPlayers(page, "Bass", 1);
  await addPlayers(page, "Drums", 1);
  await addPlayers(page, "Keys", 1);
  await expect(page.getByText("That's 13 channels.")).toBeVisible();
  await page.getByLabel("We use in-ear monitors").check();

  await page.getByRole("button", { name: "Save for later" }).click();
  await expect(page.getByText("Done: Saved your band (6 players) for later.")).toBeVisible();
  const preview = page.getByRole("table", { name: "Input list" });
  await expect(preview.getByRole("row")).toHaveCount(14);
  await expect(
    preview.getByRole("row", { name: /^1 Vocal 1 Mic Tall boom Lead vocal/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Send to the audio team" }).click();
  await expect(page.getByText("Done: Sent your band (6 players) to the audio team.")).toBeVisible();
  await expect(async () => {
    const query = encodeURIComponent('subject:"Band setup from Lakeside worship"');
    const { messages } = (await (
      await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`)
    ).json()) as { messages: { To: { Address: string }[] }[] };
    expect(messages.map((m) => m.To[0].Address)).toContain(`${o.admin.username}@example.com`);
  }).toPass({ timeout: 20_000 });
});

test("staff adjust and share the list, and the PDF matches the screen", async ({
  page,
  browser,
}) => {
  await signIn(page, o.admin, o.slug);
  await page.goto(`/guests/${o.worship.id}`);
  await page.getByRole("link", { name: "See the band and input list" }).click();
  await expect(page.getByText("2 × Vocal: Lead vocal, wireless if possible")).toBeVisible();
  await expect(page.getByText("In-ear monitors")).toBeVisible();

  await page.getByLabel("Channel 1 source", { exact: true }).fill("Lead vocal (wireless)");
  // Keys come before drums, so Tom 2 is channel 11 and the overheads are 12 and 13.
  await page.getByRole("button", { name: "Remove channel 11" }).click();
  await page.getByRole("button", { name: "Move channel 12 up" }).click();
  await page.getByRole("button", { name: "Add channel" }).click();
  await page.getByLabel("Channel 13 source", { exact: true }).fill("Spare vocal");
  await page.getByRole("button", { name: "Save input list" }).click();
  await expect(page.getByText("Done: Saved 13 channels.")).toBeVisible();

  await page.getByRole("button", { name: "Share with the group" }).click();
  await expect(page.getByText("Done: Shared with the group.")).toBeVisible();
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("link", { name: "Download the input list (PDF)" })).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 20_000 });

  const sources = await editorSources(page);
  expect(sources).toHaveLength(13);
  expect(sources.slice(9, 12)).toEqual(["Tom 1", "Overhead right", "Overhead left"]);
  const expected = `13 channels: ${sources.map((s, i) => `${i + 1} ${s}`).join("; ")}`;
  expect(
    await pdfSubject(page.request, `${staffBandPage.replace("/band", "")}/input-list.pdf`),
  ).toBe(expected);

  // The group sees staff's list and the same PDF.
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(`${portal}/band`);
  await expect(
    guestPage.getByText("The audio team prepared this list for your visit."),
  ).toBeVisible();
  await expect(guestPage.getByRole("cell", { name: "Lead vocal (wireless)" })).toBeVisible();
  expect(await pdfSubject(guestPage.request, `${portal}/input-list.pdf`)).toBe(expected);
  await guest.close();
});

test("a group's later changes never wipe staff's list without a warning", async ({
  page,
  browser,
}) => {
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(`${portal}/band`);
  await addPlayers(guestPage, "Acoustic guitar", 1);
  await guestPage.getByRole("button", { name: "Send changes" }).click();
  await expect(
    guestPage.getByText("Done: Sent your changes (7 players) to the audio team."),
  ).toBeVisible();
  await guestPage.reload();
  await expect(guestPage.getByText("You changed your band after they prepared it")).toBeVisible();
  // Still staff's list.
  await expect(guestPage.getByRole("cell", { name: "Lead vocal (wireless)" })).toBeVisible();

  await signIn(page, o.admin, o.slug);
  await page.goto(staffBandPage);
  await expect(
    page.getByText("The group changed its band after this list was made."),
  ).toBeVisible();
  await expect(page.getByLabel("Channel 1 source", { exact: true })).toHaveValue(
    "Lead vocal (wireless)",
  );

  await page.getByRole("button", { name: "Rebuild from the group's band" }).click();
  await expect(page.getByText("Done: Rebuilt from the group's band: 14 channels.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Channel 1 source", { exact: true })).toHaveValue("Vocal 1");
  await expect(page.getByText("The group changed its band after this list was made.")).toHaveCount(
    0,
  );
  await guestPage.reload();
  await expect(guestPage.getByRole("cell", { name: "Acoustic guitar" })).toBeVisible();
  await guest.close();
});

test("campus admins edit the positions guests choose from", async ({ page, browser }) => {
  await signIn(page, o.admin, o.slug);
  await page.goto("/settings");
  await page.getByRole("link", { name: "Band positions" }).click();
  await page.getByRole("link", { name: `${o.campus.name} (${o.campus.code})` }).click();
  await page.getByLabel("New position").fill("Trumpet");
  await page.getByRole("button", { name: "Add position" }).click();
  await expect(page.getByText("Done: Added Trumpet.")).toBeVisible();

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(`/portal/${o.choir.token}/band`);
  await expect(guestPage.getByRole("button", { name: "Add trumpet" })).toBeVisible();

  await page.getByText("Edit Trumpet").click();
  await page.getByRole("button", { name: "Delete Trumpet" }).click();
  // Its section (and that form's message) goes away with it.
  await expect(page.getByRole("region", { name: "Trumpet" })).toHaveCount(0);
  await guestPage.reload();
  await expect(guestPage.getByRole("button", { name: "Add trumpet" })).toHaveCount(0);
  await guest.close();
});

test("editors can't change band positions", async ({ page }) => {
  await signIn(page, o.quietEditor, o.slug);
  expect((await page.goto(`/settings/band-positions/${o.campus.id}`))?.status()).toBe(404);
});
