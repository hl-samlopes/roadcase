import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL, MAILPIT_URL, notifyOrganization as org } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

// One contract, from preparing it through both signatures to the PDF and audit trail.
test.describe.configure({ mode: "serial" });

const checkoutUrl = `/checkouts/${org.choir.id}`;
const staffEmail = `${org.southEditor.username}@example.com`;
let textHash = "";

type Message = {
  ID: string;
  Subject: string;
  Attachments?: { PartID: string; FileName: string; ContentType: string }[];
};

async function inbox(address: string): Promise<Message[]> {
  const query = encodeURIComponent(`to:${address}`);
  const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
  return ((await response.json()) as { messages: Message[] }).messages;
}

async function draw(page: Page, canvasId: string) {
  const box = (await page.locator(`#${canvasId}`).boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(box.x + 30 + i * 12, box.y + box.height * (0.6 - Math.sin(i / 3) * 0.3));
  }
  await page.mouse.up();
}

test.beforeAll(async () => {
  for (const address of [org.choir.guestEmail, staffEmail]) {
    const query = encodeURIComponent(`to:${address}`);
    await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`, { method: "DELETE" });
  }
});

test("both parties sign on one device and the check-out goes out", async ({ page }) => {
  // The proxy in front of Roadcase reports the client's address this way.
  await page.setExtraHTTPHeaders({ "x-forwarded-for": "203.0.113.9" });
  await signIn(page, org.southEditor, org.slug);
  await page.goto(checkoutUrl);
  await page.getByRole("button", { name: "Prepare contract for signing" }).click();
  await expect(page.getByText("Awaiting signatures", { exact: true })).toBeVisible();
  // The item list is locked while the contract waits for signatures.
  await expect(page.getByLabel("Scan or type item codes")).toHaveCount(0);

  await page.getByRole("link", { name: "Open the signing screen" }).click();
  const contract = page.getByRole("article", { name: "Contract to sign" });
  await expect(contract).toContainText(
    `and ${org.choir.group}, represented by ${org.choir.guestName}`,
  );
  await expect(contract.getByRole("cell", { name: org.southMixer.code })).toBeVisible();

  // Guest representative: nothing drawn is refused; then they draw and sign.
  const guest = page
    .getByRole("region", { name: "Guest representative" })
    .or(
      page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Guest representative" }) }),
    );
  await expect(guest.getByLabel("Printed name")).toHaveValue(org.choir.guestName);
  await guest.getByLabel(/I have read this contract/).check();
  await guest.getByRole("button", { name: "Sign as guest representative" }).click();
  await expect(guest.getByText("Signature: Draw your signature in the box.")).toBeVisible();
  await draw(page, "signature-guest");
  await expect(guest.getByText("Signature ready.")).toBeVisible();
  await guest.getByRole("button", { name: "Sign as guest representative" }).click();
  await expect(page.getByText(`Signed by ${org.choir.guestName}`)).toBeVisible();

  // Staff representative: uses their typed name as the signature.
  const staff = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Staff representative" }) });
  await staff.getByLabel(/I have read this contract/).check();
  await staff.getByRole("button", { name: "Use my typed name instead" }).click();
  await staff.getByRole("button", { name: "Sign as staff representative" }).click();
  await expect(page.getByText(/Both parties have signed/)).toBeVisible();

  await page.goto(checkoutUrl);
  await expect(page.getByText("Out", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Return to draft" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Cancel check-out/ })).toHaveCount(0);
  // Editors don't see the audit trail.
  await expect(page.getByText("Audit trail")).toHaveCount(0);
});

test("the signed PDF reaches both parties and matches the audit trail", async ({ page }) => {
  for (const address of [org.choir.guestEmail, staffEmail]) {
    await expect
      .poll(async () => (await inbox(address)).map((m) => m.Subject), { timeout: 45_000 })
      .toContain(`Signed contract: check-out #${org.choir.number} (${org.choir.group})`);
  }

  await signIn(page, org.admin, org.slug);
  await page.goto(checkoutUrl);
  await page.getByText("Audit trail").click();
  const hashCell = page
    .locator("dt", { hasText: "Contract text SHA-256" })
    .locator("xpath=following-sibling::dd[1]");
  textHash = (await hashCell.innerText()).trim();
  expect(textHash).toMatch(/^[0-9a-f]{64}$/);
  await expect(page.getByText("203.0.113.9").first()).toBeVisible();
  await expect(
    page.getByRole("img", { name: `Signature of ${org.choir.guestName}` }),
  ).toBeVisible();

  // The download and the emailed copy are the same PDF, carrying the same hash.
  const download = await page.request.get(`${checkoutUrl}/contract.pdf`);
  expect(download.headers()["content-type"]).toBe("application/pdf");
  const pdf = Buffer.from(await download.body());
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.toString("latin1")).toContain(textHash);

  const [message] = await inbox(org.choir.guestEmail);
  const detail = (await (
    await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`)
  ).json()) as Message;
  const attachment = detail.Attachments?.find((a) => a.ContentType === "application/pdf");
  expect(attachment?.FileName).toBe(`contract-checkout-${org.choir.number}.pdf`);
  const emailed = Buffer.from(
    await (
      await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}/part/${attachment!.PartID}`)
    ).arrayBuffer(),
  );
  expect(emailed.equals(pdf)).toBe(true);
});

test("a signed contract can't change, and signatures stay with admins", async ({ browser }) => {
  // Even directly in the database, the signed text and signatures are fixed.
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await expect(
      client.query(`update "Contract" set text = 'changed' where "checkoutId" = $1`, [
        org.choir.id,
      ]),
    ).rejects.toThrow("A contract's content can't change");
    await expect(
      client.query(
        `delete from "ContractSignature" where "contractId" in (select id from "Contract" where "checkoutId" = $1)`,
        [org.choir.id],
      ),
    ).rejects.toThrow("Signatures can't be deleted");
  } finally {
    await client.end();
  }

  // Anyone who can see the check-out may download the PDF; signature images are admin-only.
  const viewer = await (await browser.newContext()).newPage();
  await signIn(viewer, org.southEditor, org.slug);
  expect((await viewer.request.get(`${checkoutUrl}/contract.pdf`)).status()).toBe(200);
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, org.admin, org.slug);
  await admin.goto(checkoutUrl);
  await admin.getByText("Audit trail").click();
  const imageUrl = await admin
    .getByRole("img", { name: `Signature of ${org.choir.guestName}` })
    .getAttribute("src");
  expect((await admin.request.get(imageUrl!)).headers()["content-type"]).toBe("image/png");
  expect((await viewer.request.get(imageUrl!)).status()).toBe(404);

  const north = await (await browser.newContext()).newPage();
  await signIn(north, org.editor, org.slug);
  expect((await north.request.get(`${checkoutUrl}/contract.pdf`)).status()).toBe(404);
});
