import { expect, test } from "@playwright/test";
import { accounts, BULK_ITEM_COUNT, items, serialField } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

const files = "tests/e2e/files";

test("an editor adds an item with a photo and custom field, then finds it by scanning", async ({
  page,
}) => {
  await signIn(page, accounts.meadowRanchEditor);
  await page.getByRole("link", { name: "New item" }).click();

  await page.getByLabel("Name").fill("Shure SM58");
  // The editor can only add items at Meadow Ranch, so that home is preselected.
  await expect(page.getByLabel("Home (location and owning department)")).toHaveValue(/.+/);
  await page.getByLabel("Category", { exact: true }).selectOption({ label: "Audio" });
  await page.getByLabel("Subcategory").selectOption({ label: "Microphones" });
  await expect(page.getByLabel("Condition")).toHaveValue(/.+/);
  await page.getByLabel("Price").fill("$99.00");
  await page.getByLabel(serialField.label).fill("SN-58-001");

  // A file that isn't really an image is refused, and the form keeps what was typed.
  await page.getByLabel("Photo").setInputFiles(`${files}/not-an-image.png`);
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Photos must be JPEG, PNG or WebP images.",
  );
  await expect(page.getByLabel("Name")).toHaveValue("Shure SM58");

  await page.getByLabel("Photo").setInputFiles(`${files}/speaker.png`);
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("heading", { name: "Shure SM58" })).toBeVisible();
  const status = await page.getByRole("status").filter({ hasText: "Done: created" }).textContent();
  const code = /HLK-\d{6}/.exec(status ?? "")?.[0];
  expect(code).toBeDefined();

  await expect(page.getByText("SN-58-001")).toBeVisible();
  await expect(page.getByText("$99.00")).toBeVisible();
  await expect(page.getByRole("img", { name: `Barcode for ${code}` })).toBeVisible();
  const photo = page.getByRole("img", { name: "Photo of Shure SM58" });
  await expect(photo).toBeVisible();
  expect(await photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // A barcode scanner types the code and presses Enter, from any page; "/" focuses the field.
  await page.goto("/service-log");
  // Retried: the shortcut listens once the page's scripts have loaded, which can lag under load.
  await expect(async () => {
    await page.keyboard.press("/");
    await expect(page.getByLabel("Scan or enter an item code")).toBeFocused({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await page.keyboard.type(code!.toLowerCase());
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Shure SM58" })).toBeVisible();

  // Attachments: a PDF manual uploads; the editor can delete it again.
  await page.getByLabel("Add a photo or document").setInputFiles(`${files}/manual.pdf`);
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("link", { name: "manual.pdf" })).toBeVisible();
  await page.getByRole("button", { name: "Delete manual.pdf" }).click();
  await expect(page.getByRole("link", { name: "manual.pdf" })).toHaveCount(0);
});

test("an editor edits an item; a viewer can see it but not edit it", async ({ browser }) => {
  const editor = await (await browser.newContext()).newPage();
  await signIn(editor, accounts.meadowRanchEditor);
  await editor.goto(`/items/${items.hlk.id}`);
  await editor.getByRole("link", { name: "Edit item" }).click();
  await editor.getByLabel("Notes").fill("Spare batteries in the case.");
  await editor.getByRole("button", { name: "Save item" }).click();
  await expect(editor.getByText("Done: changes saved.")).toBeVisible();
  await expect(editor.getByText("Spare batteries in the case.")).toBeVisible();

  const viewer = await (await browser.newContext()).newPage();
  await signIn(viewer, accounts.campusSwitcher);
  await viewer.goto(`/items/${items.hlk.id}`);
  await expect(viewer.getByRole("heading", { name: items.hlk.name })).toBeVisible();
  await expect(viewer.getByText("Spare batteries in the case.")).toBeVisible();
  await expect(viewer.getByRole("link", { name: "Edit item" })).toHaveCount(0);
  await expect(viewer.getByLabel("Add a photo or document")).toHaveCount(0);
  await expect(viewer.getByRole("link", { name: "New item" })).toHaveCount(0);
  expect((await viewer.goto(`/items/${items.hlk.id}/edit`))?.status()).toBe(404);
  await viewer.goto("/items/new");
  await expect(viewer.getByText("You can't add items yet.")).toBeVisible();
});

test("attachments are only served to people who can see the item", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, accounts.admin);
  await admin.goto(`/items/${items.hne.id}`);
  await admin.getByLabel("Add a photo or document").setInputFiles(`${files}/manual.pdf`);
  await admin.getByRole("button", { name: "Upload" }).click();
  const link = admin.getByRole("link", { name: "manual.pdf" });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  const ok = await admin.request.get(href!);
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toBe("application/pdf");

  const outsider = await (await browser.newContext()).newPage();
  await signIn(outsider, accounts.meadowRanchEditor);
  expect((await outsider.request.get(href!)).status()).toBe(404);

  const signedOut = await browser.newContext();
  expect((await signedOut.request.get(href!, { maxRedirects: 0 })).status()).toBe(404);
});

test("search, filters, sorting and pages", async ({ page }) => {
  // Not the campus-switcher account: that test changes its campus in parallel.
  await signIn(page, accounts.preferences);
  await expect(page.getByText(new RegExp(`^${BULK_ITEM_COUNT + 2}|items ·`))).toBeVisible();
  await expect(page.getByText("Page 1 of 2 (50 per page)")).toBeVisible();
  await page.getByRole("link", { name: "Next page" }).click();
  await expect(page.getByText("Page 2 of 2 (50 per page)")).toBeVisible();

  await page.getByLabel("Search").fill("monitor");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("link", { name: items.hne.name })).toBeVisible();
  await expect(page.getByText("1 item ·")).toBeVisible();

  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await expect(page.getByLabel("Search")).toHaveValue("");
  await page.getByLabel("Category", { exact: true }).selectOption({ label: "Cabling" });
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText(`${BULK_ITEM_COUNT} items ·`)).toBeVisible();

  await page.getByRole("link", { name: /^Name/ }).click();
  await expect(page).toHaveURL(/sort=name&dir=asc/);
  await page.getByRole("link", { name: /^Name/ }).click();
  await expect(page).toHaveURL(/sort=name&dir=desc/);
  await expect(page.locator("tbody tr").first()).toContainText(
    `XLR cable ${String(BULK_ITEM_COUNT).padStart(3, "0")}`,
  );
  await expect(page.getByRole("columnheader", { name: /Name/ })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
});

test("CSV export and batch labels follow what the user can see", async ({ page }) => {
  await signIn(page, accounts.meadowRanchEditor);
  const csv = await (await page.request.get("/items/export")).text();
  expect(csv.split("\r\n")[0]).toContain("Code,Name,Category,Subcategory,Campus,Location");
  expect(csv).toContain(serialField.label);
  expect(csv).toContain(items.hlk.code);
  expect(csv).not.toContain(items.hne.code);

  await page.getByLabel(`Select ${items.hlk.code} for labels`).check();
  await page.getByRole("button", { name: "Print labels for selected" }).click();
  await expect(page.getByRole("button", { name: "Print 1 label" })).toBeVisible();
  await expect(page.getByRole("img", { name: `Barcode for ${items.hlk.code}` })).toBeVisible();

  // Asking for another campus's item by id prints nothing for it.
  await page.goto(`/items/labels?id=${items.hlk.id}&id=${items.hne.id}`);
  await expect(page.getByRole("button", { name: "Print 1 label" })).toBeVisible();
  await expect(page.getByText(items.hne.code)).toHaveCount(0);
});

test("an unknown code shows a message instead of an item", async ({ page }) => {
  await signIn(page, accounts.meadowRanchEditor);
  await page.goto(`/items/scan?code=${items.hne.code}`);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    `No item you can see has the code ${items.hne.code}`,
  );
});

test("an editor logs routine service on an item without a ticket", async ({ browser }) => {
  // The last bulk cable at the HSC warehouse: no other test totals its service costs.
  const cable = "/items/scan?code=HSC-000055";
  const editor = await (await browser.newContext()).newPage();
  await signIn(editor, accounts.admin);
  await editor.goto(cable);
  await editor.getByText("Log service without a ticket").click();
  await editor.getByLabel("Service type").fill("Cleaning");
  await editor.getByLabel("Cost").fill("12");
  await editor.getByLabel("Notes", { exact: true }).fill("Cleaned the connectors.");
  await editor.getByRole("button", { name: "Log service", exact: true }).click();
  await expect(editor.getByText("Done: Logged Cleaning.")).toBeVisible();
  await expect(
    editor.getByRole("row", { name: /Cleaning \$12\.00 Cleaned the connectors\./ }),
  ).toBeVisible();

  // Viewers see the history but can't add to it.
  const viewer = await (await browser.newContext()).newPage();
  await signIn(viewer, accounts.preferences);
  await viewer.goto(cable);
  await expect(viewer.getByRole("row", { name: /Cleaning/ })).toBeVisible();
  await expect(viewer.getByText("Log service without a ticket")).toHaveCount(0);
});
