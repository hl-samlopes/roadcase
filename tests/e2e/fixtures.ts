/**
 * Fixed data for end-to-end tests. These accounts exist only in the
 * throwaway e2e database that global setup rebuilds on every run.
 */

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://roadcase:roadcase@localhost:5432/roadcase_e2e";

/** Test uploads go to their own bucket, emptied by global setup. */
export const E2E_BUCKET = "roadcase-e2e";

/** Mailpit (from docker compose) catches the e2e worker's email; tests read it back. */
export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

/** The seeded admin's address, where test emails go. */
export const E2E_ADMIN_EMAIL = "e2e-admin@example.com";

/** Encrypts Slack webhook URLs in e2e runs only (shared by the app and the worker). */
export const E2E_SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");

/** A stand-in for Slack that records what was posted; global setup runs it. */
export const FAKE_SLACK_URL = "http://localhost:3199";

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

/**
 * An organization for ticket notification and check-out tests, so its
 * tickets, email and check-outs never mix with other specs. Everyone's
 * address is <username>@example.com.
 */
export const notifyOrganization = {
  slug: "signal",
  name: "Signal Camps",
  north: { id: "0190a000-0000-7000-8000-000000000031", code: "SGN", name: "Signal North" },
  south: { id: "0190a000-0000-7000-8000-000000000032", code: "SGS", name: "Signal South" },
  locationId: "0190a000-0000-7000-8000-000000000033",
  departmentId: "0190a000-0000-7000-8000-000000000034",
  item: { id: "0190a000-0000-7000-8000-000000000035", code: "SGN-000001", name: "Stage box" },
  southLocationId: "0190a000-0000-7000-8000-000000000036",
  /** For check-outs: available at North, a North item in Poor (not available), and a South item. */
  micStand: { code: "SGN-000002", name: "Mic stand" },
  oldDiBox: { code: "SGN-000003", name: "Old DI box" },
  southMixer: { code: "SGS-000001", name: "South mixer" },
  admin: { username: "sg-admin", password: "e2e-sg-admin-pass-1" },
  /** Editor at Signal North: gets new-ticket emails. */
  editor: { username: "sg-editor", password: "e2e-sg-editor-pass-1" },
  /** Editor at Signal North who turned new-ticket emails off. */
  optedOut: { username: "sg-quiet", password: "e2e-sg-quiet-pass-1" },
  /** Commenter at Signal North who reports problems. */
  reporter: { username: "sg-reporter", password: "e2e-sg-reporter-pass-1" },
  /** Editor at Signal South: can't see North's tickets. */
  southEditor: { username: "sg-south", password: "e2e-sg-south-pass-1" },
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
  campusAdmin: { username: "fh-campus-admin", password: "e2e-fh-campus-admin-pass-1" },
  viewer: { username: "fh-viewer", password: "e2e-fh-viewer-pass-1" },
};
