/**
 * Fixed data for end-to-end tests. These accounts exist only in the
 * throwaway e2e database that global setup rebuilds on every run.
 */

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://roadcase:roadcase@localhost:5432/roadcase_e2e";

export const ids = {
  meadowRanch: "0190a000-0000-7000-8000-000000000001",
  hneMain: "0190a000-0000-7000-8000-000000000002",
  production: "0190a000-0000-7000-8000-000000000003",
  hlkItem: "0190a000-0000-7000-8000-000000000011",
  hneItem: "0190a000-0000-7000-8000-000000000012",
};

export const items = {
  hlk: { id: ids.hlkItem, code: "HLK-000001", name: "Wireless mic kit" },
  hne: { id: ids.hneItem, code: "HNE-000001", name: "Stage monitor wedge" },
};

export const accounts = {
  admin: { username: "e2e-admin", password: "e2e-admin-password-1" },
  meadowRanchEditor: { username: "mr-editor", password: "e2e-mr-editor-pass-1" },
  passwordChanger: { username: "pw-changer", password: "e2e-pw-changer-pass-1" },
  toDeactivate: { username: "to-deactivate", password: "e2e-deactivate-pass-1" },
  preferences: { username: "prefs-user", password: "e2e-prefs-user-pass-1" },
  campusSwitcher: { username: "campus-user", password: "e2e-campus-user-pass-1" },
  textSize: { username: "text-size-user", password: "e2e-text-size-pass-1" },
};

/** A second organization with its own branding, for sign-in branding tests. */
export const brandedOrganization = {
  slug: "northwind",
  name: "Northwind Camps",
  displayName: "Northwind Production",
  signInHeadline: "Welcome to Northwind",
  signInMessage: "Use your staff account to sign in.",
  lightAccent: "#7A1FA2",
};
