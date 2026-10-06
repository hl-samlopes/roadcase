import { expect, test, type Page } from "@playwright/test";
import { notifyOrganization as org } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

// One campus template, edited step by step.
test.describe.configure({ mode: "serial" });

async function openTemplate(page: Page) {
  await signIn(page, org.admin, org.slug);
  await page.goto("/settings");
  await page.getByRole("link", { name: "Contract templates" }).click();
  await page.getByRole("link", { name: `${org.north.name} (${org.north.code})` }).click();
  await expect(
    page.getByRole("heading", { name: `Contract template: ${org.north.name}` }),
  ).toBeVisible();
}

const editor = (page: Page) => page.getByRole("textbox", { name: "Contract template" });

/**
 * Puts the caret at the end of the template by clicking its last paragraph.
 * Retries until the editor's own selection follows: in development React
 * mounts the editor twice, and a click in that first instant is missed.
 */
async function caretAtEnd(page: Page) {
  await expect(async () => {
    // The editor always ends with a paragraph (it adds one after a table).
    await editor(page).locator(":scope > p").last().click();
    const atEnd = await page.evaluate(() => {
      const dom = document.querySelector(".ProseMirror") as unknown as {
        editor?: { state: { selection: { from: number }; doc: { content: { size: number } } } };
      };
      const state = dom.editor?.state;
      return !!state && state.selection.from >= state.doc.content.size - 1;
    });
    expect(atEnd).toBe(true);
  }).toPass({ timeout: 10_000 });
}

test("a campus admin edits the template with a table and fields, then previews it", async ({
  page,
}) => {
  await openTemplate(page);
  await page.getByRole("button", { name: "Start from the placeholder" }).click();
  await expect(page.getByText("Editing version 1.")).toBeVisible();
  await expect(editor(page)).toContainText("DRAFT — NOT REVIEWED");

  // Add a heading, a table and fields at the end of the document.
  await caretAtEnd(page);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Heading 2" }).click();
  await page.keyboard.type("Pickup checklist");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Insert table" }).click();
  await page.keyboard.type("Step");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Who");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Done");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Count cables for ");
  await page.getByLabel("Insert a field").selectOption("group");
  await expect(page.getByRole("button", { name: "Add row below" })).toBeVisible();
  await page.keyboard.press("Tab");
  // A typo in a field name is flagged right away.
  await page.keyboard.type("{{grup}}");
  await expect(page.getByText("Unknown field: these won't be filled in.")).toBeVisible();
  await expect(page.getByRole("status").getByText("{{grup}}")).toBeVisible();

  await page.getByRole("button", { name: "Save as a new version" }).click();
  await expect(
    page.getByText("Done: Saved as version 2. Unknown field won't be filled in: {{grup}}."),
  ).toBeVisible();
  await expect(page.getByText("Editing version 2.")).toBeVisible();
  await expect(page.getByText("Version 1", { exact: true })).toBeVisible();

  // Saving again without changes doesn't create a version.
  await page.getByRole("button", { name: "Save as a new version" }).click();
  await expect(page.getByText("Done: No changes to save.")).toBeVisible();

  // Preview against a real draft check-out.
  await page.getByRole("link", { name: "Preview", exact: true }).click();
  await page.getByLabel("Fill from").selectOption({
    label: `Check-out #${org.bandCamp.number}: ${org.bandCamp.group}`,
  });
  await page.getByRole("button", { name: "Show preview" }).click();
  await expect(
    page.getByText(
      `Version 2, filled from check-out #${org.bandCamp.number} (${org.bandCamp.group})`,
    ),
  ).toBeVisible();
  const contract = page.getByRole("article", { name: "Contract preview" });
  await expect(contract.getByRole("heading", { name: "Pickup checklist" })).toBeVisible();
  await expect(contract.getByRole("heading", { name: /DRAFT/ })).toHaveCount(0);
  // The checklist table went at the end, after the item table.
  await expect(contract.locator("table").last()).toContainText("Count cables for Band camp");
  await expect(contract.getByRole("cell", { name: "Count cables for Band camp" })).toBeVisible();
  await expect(contract.getByRole("cell", { name: "{{grup}}" })).toBeVisible();
  // {{item_list}} became a table with the check-out's items and fees.
  await expect(contract.getByRole("cell", { name: org.bandCamp.item.code })).toBeVisible();
  await expect(contract.getByRole("cell", { name: "$30.00" })).toBeVisible();
  await expect(contract).toContainText("Total fees: $30.00");
  await expect(contract).toContainText("represented by Riley Band");

  // Version 1 is unchanged.
  await page.getByLabel("Version").selectOption("1");
  await page.getByRole("button", { name: "Show preview" }).click();
  await expect(page.getByText("Version 1, filled from")).toBeVisible();
  await expect(contract).toContainText("DRAFT — NOT REVIEWED");
  await expect(contract.getByRole("heading", { name: "Pickup checklist" })).toHaveCount(0);
});

test("a save based on an older version is refused", async ({ browser }) => {
  const first = await (await browser.newContext()).newPage();
  const second = await (await browser.newContext()).newPage();
  await openTemplate(first);
  await openTemplate(second);

  await caretAtEnd(first);
  await first.keyboard.type(" First edit.");
  await first.getByRole("button", { name: "Save as a new version" }).click();
  await expect(first.getByText("Done: Saved as version 3.")).toBeVisible();

  await caretAtEnd(second);
  await second.keyboard.type(" Second edit.");
  await second.getByRole("button", { name: "Save as a new version" }).click();
  await expect(
    second.getByText(/Someone saved a newer version while you were editing/),
  ).toBeVisible();
});

test("only admins over the campus can edit its contract", async ({ page }) => {
  await signIn(page, org.editor, org.slug);
  expect((await page.goto("/settings/contracts"))?.status()).toBe(404);
  expect((await page.goto(`/settings/contracts/${org.north.id}`))?.status()).toBe(404);
});
