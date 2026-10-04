/**
 * Fixed data for end-to-end tests. These accounts exist only in the
 * throwaway e2e database that global setup rebuilds on every run.
 */

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://roadcase:roadcase@localhost:5432/roadcase_e2e";

/** Test uploads go to their own bucket, emptied by global setup. */
export const E2E_BUCKET = "roadcase-e2e";

export const ids = {
  meadowRanch: "0190a000-0000-7000-8000-000000000001",
  hneMain: "0190a000-0000-7000-8000-000000000002",
  production: "0190a000-0000-7000-8000-000000000003",
  hlkItem: "0190a000-0000-7000-8000-000000000011",
  hneItem: "0190a000-0000-7000-8000-000000000012",
  hscWarehouse: "0190a000-0000-7000-8000-000000000004",
  hlkSpeaker: "0190a000-0000-7000-8000-000000000013",
  hneDesk: "0190a000-0000-7000-8000-000000000014",
  hneTicket: "0190a000-0000-7000-8000-000000000021",
};

/** Custom field present in the e2e organization. */
export const serialField = { key: "f_serial", label: "Serial number" };

/** Extra HSC items so the inventory list has more than one page. */
export const BULK_ITEM_COUNT = 55;

export const items = {
  hlk: { id: ids.hlkItem, code: "HLK-000001", name: "Wireless mic kit" },
  hne: { id: ids.hneItem, code: "HNE-000001", name: "Stage monitor wedge" },
  speaker: { id: ids.hlkSpeaker, code: "HLK-000002", name: "Powered speaker" },
  desk: { id: ids.hneDesk, code: "HNE-000002", name: "Lighting desk" },
};

/** A ticket that exists before the tests run, reported by the admin. */
export const existingTicket = { id: ids.hneTicket, number: 1, title: "Monitor wedge buzzes" };

export const accounts = {
  admin: { username: "e2e-admin", password: "e2e-admin-password-1" },
  meadowRanchEditor: { username: "mr-editor", password: "e2e-mr-editor-pass-1" },
  passwordChanger: { username: "pw-changer", password: "e2e-pw-changer-pass-1" },
  toDeactivate: { username: "to-deactivate", password: "e2e-deactivate-pass-1" },
  preferences: { username: "prefs-user", password: "e2e-prefs-user-pass-1" },
  campusSwitcher: { username: "campus-user", password: "e2e-campus-user-pass-1" },
  textSize: { username: "text-size-user", password: "e2e-text-size-pass-1" },
  toRename: { username: "jordan-smith", password: "e2e-rename-pass-1" },
  ticketSubmitter: { username: "fs-manager", password: "e2e-fs-manager-pass-1" },
  commenter: { username: "commenter", password: "e2e-commenter-pass-1" },
  lockout: { username: "lockout-user", password: "e2e-lockout-pass-1" },
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

/**
 * An organization whose appearance the Settings > Appearance tests change, so
 * they never affect what other tests see.
 */
export const appearanceOrganization = {
  slug: "fieldhouse",
  name: "Fieldhouse Camps",
  campusCode: "FLD",
  admin: { username: "fh-admin", password: "e2e-fh-admin-pass-1" },
  viewer: { username: "fh-viewer", password: "e2e-fh-viewer-pass-1" },
};
