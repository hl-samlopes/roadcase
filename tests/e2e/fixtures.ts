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

/** A stand-in for Google's sign-in (see fake-google.ts); the dev server uses it as Google's issuer. */
export const FAKE_GOOGLE_URL = "http://localhost:3198";
export const FAKE_GOOGLE_CLIENT = { id: "e2e-google-client", secret: "e2e-google-secret" };

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
  /** A South draft check-out to prepare and sign; the South editor is its staff representative. */
  choir: {
    id: "0190a000-0000-7000-8000-000000000038",
    number: 200,
    group: "Southside choir",
    guestName: "Morgan Choir",
    guestEmail: "morgan@example.com",
    fee: "15.00",
  },
  /** A draft check-out made by global setup for contract previews (numbered apart from #1, #2). */
  bandCamp: {
    id: "0190a000-0000-7000-8000-000000000037",
    number: 100,
    group: "Band camp",
    item: { code: "SGN-000004", name: "Preview speaker" },
    fee: "30.00",
  },
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

/**
 * An organization for return and overdue tests: its ticket numbers and email
 * stay apart from the notification tests in Signal Camps.
 */
export const harborOrganization = {
  slug: "harbor",
  name: "Harbor Camps",
  campus: { id: "0190a000-0000-7000-8000-000000000051", code: "HBR", name: "Harbor" },
  locationId: "0190a000-0000-7000-8000-000000000052",
  departmentId: "0190a000-0000-7000-8000-000000000053",
  mic: { code: "HBR-000001", name: "Return mic" },
  amp: { code: "HBR-000002", name: "Return amp" },
  pa: { code: "HBR-000003", name: "Overdue PA" },
  /** No history at all, so it can be deleted. */
  spare: { code: "HBR-000004", name: "Spare cable" },
  /** Out, due back in the future: checked in by the returns test. */
  band: { id: "0190a000-0000-7000-8000-000000000054", number: 1, group: "Harbor youth band" },
  /** Out, due back yesterday (in the organization's time zone): overdue. */
  sailing: { id: "0190a000-0000-7000-8000-000000000055", number: 2, group: "Harbor sailing club" },
  /** Campus editor and the staff representative on both check-outs. */
  editor: { username: "hb-editor", password: "e2e-hb-editor-pass-1" },
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

/** A portal token for fixtures: the right shape (43 base64url characters), easy to read. */
const fixtureToken = (word: string) => word.padEnd(43, "0");

/**
 * Lakeside Camps: the guest portal catalog and requests. At the Lakeside
 * campus, in days from today:
 * - Youth (days 10 to 12): SM58 ×4 in Good, one SM58 reserved by the
 *   retreat's approved request, and Beta 58 ×2 with one held by an
 *   overlapping draft check-out. So the youth see 3 SM58 and 1 Beta 58.
 * - Choir (days 20 to 21): nothing overlaps, so 4 SM58 and 2 Beta 58.
 * - Retreat (days 9 to 11): its request is approved, so it can't be changed.
 * Hidden from guests: Lighting (not a portal category), Cables (only items
 * in Needs repair), Staging (until the settings test shows it), a fifth SM58
 * in Needs repair, and anything at the North campus.
 */
export const portalOrganization = {
  slug: "lakeside",
  name: "Lakeside Camps",
  campus: { id: "0190a000-0000-7000-8000-000000000061", code: "LKS", name: "Lakeside" },
  north: { id: "0190a000-0000-7000-8000-000000000062", code: "LKN", name: "Lakeside North" },
  locationId: "0190a000-0000-7000-8000-000000000063",
  northLocationId: "0190a000-0000-7000-8000-000000000064",
  departmentId: "0190a000-0000-7000-8000-000000000065",
  admin: { username: "lk-admin", password: "e2e-lk-admin-pass-1" },
  micsDescription: "Wired and wireless microphones, with clips.",
  youth: {
    id: "0190a000-0000-7000-8000-000000000066",
    name: "Lakeside youth",
    email: "lk-youth@example.com",
    token: fixtureToken("youth"),
    days: [10, 12],
  },
  choir: {
    id: "0190a000-0000-7000-8000-000000000067",
    name: "Lakeside choir",
    email: "lk-choir@example.com",
    token: fixtureToken("choir"),
    days: [20, 21],
  },
  retreat: {
    id: "0190a000-0000-7000-8000-000000000068",
    name: "Staff retreat",
    email: "lk-retreat@example.com",
    token: fixtureToken("retreat"),
    days: [9, 11],
  },
  /** Step 2: sends a request that staff partly approve and turn into a check-out. */
  band: {
    id: "0190a000-0000-7000-8000-00000000006b",
    name: "Lakeside band",
    email: "lk-band@example.com",
    token: fixtureToken("band"),
    days: [30, 32],
  },
  /** Overlaps the band's dates, so it sees what the band's approval holds back. */
  campers: {
    id: "0190a000-0000-7000-8000-00000000006c",
    name: "Lakeside campers",
    email: "lk-campers@example.com",
    token: fixtureToken("campers"),
    days: [31, 33],
  },
  /** Step 3: describes its band; staff adjust, share and the group changes it. */
  worship: {
    id: "0190a000-0000-7000-8000-00000000006d",
    name: "Lakeside worship",
    email: "lk-worship@example.com",
    token: fixtureToken("worship"),
    days: [40, 42],
  },
  /** Runs check-outs at Lakeside but turned request emails off. */
  quietEditor: { username: "lk-quiet", password: "e2e-lk-quiet-pass-1" },
  /** Runs check-outs at Lakeside North only: never sees Lakeside's requests. */
  northEditor: { username: "lk-north", password: "e2e-lk-north-pass-1" },
  /** Also runs check-outs at Lakeside North; not the default contact. */
  northEditor2: { username: "lk-north2", password: "e2e-lk-north2-pass-1" },
  /** A group at Lakeside North, for the campus default contact. */
  northGroup: {
    id: "0190a000-0000-7000-8000-00000000006e",
    name: "North retreat",
    email: "lk-north-retreat@example.com",
    token: fixtureToken("north"),
    days: [50, 52],
  },
  /** The main photo of one SM58 (shown) and of a Lighting item (never shown). */
  sm58PhotoId: "0190a000-0000-7000-8000-000000000069",
  hiddenPhotoId: "0190a000-0000-7000-8000-00000000006a",
};

/**
 * Ridge Camps: Google sign-in. Its spec turns Google on, then passwords off,
 * so nothing else signs in here. Everyone's email is in ridge.test.
 */
export const googleOrganization = {
  slug: "ridge",
  name: "Ridge Camps",
  domain: "ridge.test",
  campus: { id: "0190a000-0000-7000-8000-000000000071", code: "RDG", name: "Ridge" },
  /** Organization admin; keeps a password when everyone else's is off. */
  admin: { username: "rg-admin", password: "e2e-rg-admin-pass-1", email: "admin@ridge.test" },
  /** Campus editor who signs in with Google. */
  staff: { username: "rg-staff", password: "e2e-rg-staff-pass-1", email: "pat@ridge.test" },
  /** Signs in with Google, then gets deactivated. */
  leaving: { username: "rg-leaving", password: "e2e-rg-leaving-pass-1", email: "sam@ridge.test" },
};
