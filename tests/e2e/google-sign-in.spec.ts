import { expect, test, type Page } from "@playwright/test";
import { googleOrganization as org } from "./fixtures.ts";
import { signIn } from "./helpers.ts";

// Each test builds on the settings the one before saved.
test.describe.configure({ mode: "serial" });

const REFUSED = "This Google account isn't set up for";

/** Signs in through the stand-in for Google, sending these claims. */
async function googleSignIn(
  page: Page,
  claims: { email: string; sub: string; hd?: string; verified?: boolean },
) {
  await page.goto(`/sign-in/${org.slug}`);
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await page.getByLabel("Email", { exact: true }).fill(claims.email);
  await page.getByLabel("Account ID").fill(claims.sub);
  await page.getByLabel("Workspace domain").fill(claims.hd ?? org.domain);
  await page.getByLabel("Email verified").setChecked(claims.verified ?? true);
  await page.getByRole("button", { name: "Continue" }).click();
}

/** The organization admin's password sign-in, once passwords are off for everyone else. */
async function adminSignIn(page: Page) {
  await page.goto(`/sign-in/${org.slug}`);
  await page.getByText("Organization admin? Sign in with a password").click();
  await page.getByLabel("Username").fill(org.admin.username);
  await page.getByLabel("Password").fill(org.admin.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/items$/);
}

async function saveSignInSettings(
  page: Page,
  settings: { domains?: string; passwords?: boolean; adminPasswords?: boolean },
) {
  await page.goto("/settings/sign-in");
  if (settings.domains !== undefined) {
    await page.getByLabel("Allowed Google domains").fill(settings.domains);
  }
  if (settings.passwords !== undefined) {
    await page
      .getByLabel("Everyone can sign in with a username and password")
      .setChecked(settings.passwords);
  }
  if (settings.adminPasswords !== undefined) {
    await page
      .getByLabel("Organization admins can always use a password")
      .setChecked(settings.adminPasswords);
  }
  await page.getByRole("button", { name: "Save sign-in settings" }).click();
}

test("Google sign-in is off until an organization admin allows a domain", async ({ page }) => {
  await page.goto(`/sign-in/${org.slug}`);
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toHaveCount(0);

  await signIn(page, org.admin, org.slug);
  await saveSignInSettings(page, { domains: "not a domain" });
  await expect(page.getByText("Enter domains such as hume.org, one per line.")).toBeVisible();
  await saveSignInSettings(page, { passwords: false });
  await expect(page.getByText("Passwords can only be turned off while Google")).toBeVisible();

  await saveSignInSettings(page, { domains: `@${org.domain.toUpperCase()}` });
  await expect(page.getByText("Sign-in settings saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Allowed Google domains")).toHaveValue(org.domain);
});

test("a verified account in an allowed domain signs in to the matching account", async ({
  page,
}) => {
  // The email match ignores case.
  await googleSignIn(page, { email: "Pat@Ridge.test", sub: "google-pat" });
  await expect(page).toHaveURL(/\/items$/);

  await page.goto("/account/password");
  await expect(page.getByText(`You sign in with Google as ${org.staff.email}`)).toBeVisible();
});

test("every refusal shows the same message", async ({ page }) => {
  const refusals = [
    // Another domain.
    { email: "pat@elsewhere.test", sub: "google-elsewhere", hd: "elsewhere.test" },
    // Not verified.
    { email: org.leaving.email, sub: "google-sam", verified: false },
    // No account with this email.
    { email: `nobody@${org.domain}`, sub: "google-nobody" },
    // A different Google account than the one linked to Pat.
    { email: org.staff.email, sub: "google-impostor" },
  ];
  for (const claims of refusals) {
    await googleSignIn(page, claims);
    await expect(page).toHaveURL(new RegExp(`/sign-in/${org.slug}\\?error=google$`));
    await expect(page.getByRole("alert")).toContainText(REFUSED);
  }
});

test("turning passwords off leaves them only to organization admins", async ({ page }) => {
  await signIn(page, org.admin, org.slug);
  await saveSignInSettings(page, { passwords: false, adminPasswords: false });
  await expect(page.getByText("Sign in with Google once before turning off")).toBeVisible();
  await saveSignInSettings(page, { passwords: false, adminPasswords: true });
  await expect(page.getByText("Sign-in settings saved.")).toBeVisible();
  await page.context().clearCookies();

  // Staff can't use their (right) password any more.
  await page.goto(`/sign-in/${org.slug}`);
  await page.getByText("Organization admin? Sign in with a password").click();
  await page.getByLabel("Username").fill(org.staff.username);
  await page.getByLabel("Password").fill(org.staff.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("That username and password don't match")).toBeVisible();

  // The organization admin still can.
  await page.getByLabel("Username").fill(org.admin.username);
  await page.getByLabel("Password").fill(org.admin.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/items$/);
});

test("deactivating a user ends their Google session", async ({ browser }) => {
  const leaving = await browser.newPage();
  await googleSignIn(leaving, { email: org.leaving.email, sub: "google-sam" });
  await expect(leaving).toHaveURL(/\/items$/);

  const admin = await browser.newPage();
  await adminSignIn(admin);
  await admin.goto("/settings/users");
  await admin.getByRole("link", { name: org.leaving.username }).click();
  await admin.getByRole("button", { name: "Deactivate account" }).click();
  await expect(admin.getByText("Account deactivated and signed out.")).toBeVisible();

  await leaving.reload();
  await expect(leaving).toHaveURL(/\/sign-in/);
  // Nor can they come back in with Google.
  await googleSignIn(leaving, { email: org.leaving.email, sub: "google-sam" });
  await expect(leaving.getByRole("alert")).toContainText(REFUSED);
});

test("an admin can unlink a Google account so another one can link", async ({ page }) => {
  await adminSignIn(page);
  await page.goto("/settings/users");
  await page.getByRole("link", { name: org.staff.username }).click();
  await expect(page.getByText(`Signs in with Google as ${org.staff.email}`)).toBeVisible();
  await page.getByRole("button", { name: "Unlink Google account" }).click();
  await expect(page.getByText("Google account unlinked.")).toBeVisible();
  await page.context().clearCookies();

  await googleSignIn(page, { email: org.staff.email, sub: "google-pat-new" });
  await expect(page).toHaveURL(/\/items$/);
});
