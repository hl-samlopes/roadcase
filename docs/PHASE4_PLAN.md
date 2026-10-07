# Phase 4 plan: Google, RFID and the AI agent

Goal: HNE staff sign in with their Google accounts, move files between Roadcase and Google Drive, read RFID tags wherever they scan barcodes today (including a whole-room inventory count), and ask an assistant about equipment, which only sees what they can see. Work in the order below; finish and test each step before the next.

Phases 1 to 3 are in place:
- Phase 1: scoped permissions, inventory with barcodes, tickets and service logs, branding.
- Phase 2: check-outs with contracts and e-signature, email and Slack notifications, the background worker.
- Phase 3: the guest portal with requests, review and the band builder; campus default contacts.

MaintainX stays at the end of the project.

## Decisions needed

These come from `docs/SCOPE.md` and from building Phases 1 to 3. Each lists the step it blocks and the default used if there's no answer by then.

| Question | Blocks | Default if unanswered |
| --- | --- | --- |
| Which Google Workspace domains can sign in (for example `hume.org`)? | Step 0 | Organization admins list allowed domains in Settings; Google sign-in is off until at least one is listed |
| Does Google sign-in replace passwords? | Step 0 | Both work. An admin can turn passwords off for the organization, except for organization admins, who keep a password as a way back in if Google is down |
| Does signing in with Google create accounts? | Step 0 | No. It signs in an existing account whose email matches the verified Google email. Admins still create accounts and grants |
| What does "Drive import" mean? | Step 1 | Attaching a file picked from Drive (a manual, a photo, a quote) to an item, ticket or service log; Roadcase stores its own copy. No bulk inventory import: the app starts empty, as decided |
| What goes to Drive? | Step 1 | "Save to Drive" on what can already be downloaded: the inventory and service log CSVs, signed contract PDFs and input list PDFs, into a folder the user picks |
| Which RFID readers? | Step 2 | Readers that type the tag and press Enter, like the barcode scanners in use now (many USB and Bluetooth handhelds can). Reader-specific connections (Web Serial, vendor SDKs) wait until hardware is chosen |
| Is an inventory count part of Phase 4? | Step 2 | Yes: scan every tag (or barcode) in a room and compare it with what should be there |
| Can equipment data be sent to an AI provider (Anthropic)? Who approves? | Step 3 | Off until an organization admin turns it on in Settings, after HNE leadership approves; the setting records who turned it on and when |
| What should the assistant do first? | Step 3 | Answer questions (read only) and draft text that a person reviews: ticket summaries and service log notes. It never changes records itself |
| Budget for AI use? | Step 3 | A monthly limit per organization, set by its admins; the assistant stops for the month at the limit |
| Date-aware check-outs (bookings)? Open since Phase 3 Step 2 | Not in Phase 4 | Unchanged: an item on any active check-out can't go on another. Plan it separately if HNE wants future bookings |

## New dependencies to approve

- **Step 0:** none. Auth.js already includes the Google provider.
- **Step 1:** none for the server; Drive's REST API is called with `fetch`. The Google Picker loads Google's own script on the pages that use it, so the security headers must allow `apis.google.com` there.
- **Step 2:** none.
- **Step 3:** `@anthropic-ai/sdk`, Anthropic's official SDK.

## Step 0: Google sign-in

Status: built on `phase4/step0` with the defaults above (no answers yet). Setup for a deployment is in `docs/DEPLOY.md` under "Google sign-in".

- Add the Google provider to Auth.js alongside username and password.
- **Who can sign in:**
  - Google's email must be verified and in one of the organization's allowed domains (Google's `hd` claim).
  - It must match an active account in that organization; the match ignores case.
  - Anything else gets a plain "This Google account isn't set up for Roadcase" message, the same for every reason.
- **Sessions:** the same signed cookie as today, with the account's session version checked on every request, so deactivating a user still ends their sessions at once.
- **Settings > Sign-in** (organization admins):
  - allowed domains;
  - whether passwords still work;
  - whether organization admins keep their passwords (kept by default).
- **Sign-in page:** "Sign in with Google" appears on the organization's branded sign-in page when the organization has it on.
- **Account page:** shows which Google account was last used. An admin can unlink it.
- **Secrets:** the Google client secret is a deployment setting (environment), never stored in the database or logged. OAuth tokens aren't kept for sign-in.
- Done when: a user in an allowed domain signs in with Google; one from another domain, or without an account, is refused with the same message; turning passwords off blocks password sign-in for everyone but organization admins; and deactivating a user ends their Google session.

## Step 1: Google Drive

- Drive access is per person, asked for only when they first use it. It uses the narrow `drive.file` scope, so Roadcase can open only the files the person picks or Roadcase makes, never the rest of their Drive.
- Refresh tokens are secrets: encrypted with `src/lib/secrets.ts`, never shown or logged. They can be disconnected from the Account page, which also revokes them with Google.
- **Attach from Drive:**
  - On an item, ticket or service log, "Attach from Drive" opens the Google Picker.
  - The file is copied into Roadcase's storage, with the same size and type limits as uploads, so who can see it is decided by Roadcase's permissions, not Drive's sharing.
  - The attachment notes where it came from.
- **Save to Drive:**
  - On the inventory and service log CSV exports, a signed contract PDF and a shared input list PDF.
  - The person picks a folder, and the worker uploads the file.
  - Only what that person can already download goes.
- Done when: a user attaches a manual from Drive to an item and a viewer who can see the item opens it; a service log CSV (with the person's filters) is saved to a chosen folder; and disconnecting Drive revokes access.

## Step 2: RFID tags

- **Tags on items:**
  - The item page lists its tags; editors add one by scanning it into a field, or remove one.
  - A tag belongs to one item in the organization. Scanning a tag already on another item says which one and doesn't move it unless the editor confirms.
  - This uses the existing `RfidTag` table.
- **Scanning a tag works wherever a barcode does:**
  - the top-bar scan box opens the item;
  - adding items to a check-out, and checking them in, accept tags;
  - the camera button stays barcode-only.
  - A value matching both a code and a tag is treated as the code.
- Bulk readers send many tags quickly. Repeats within a scan session are ignored, and the screen shows a running count rather than one message per tag.
- **Inventory count:**
  - Pick a location (and optionally a department).
  - Scan tags or barcodes until done.
  - Roadcase lists what was found, what's missing (expected there and not on an active check-out), and what was found but belongs somewhere else.
  - Counts are saved with who ran them and when, for editors at that location. Missing items can be flagged with a condition in one step, which may open repair tickets.
- Done when: an editor tags two items, scanning either tag opens the item, a check-out takes items by tag, and a count of a location lists one missing and one misplaced item correctly.

## Step 3: AI assistant

- **Off by default:** an organization admin turns it on in Settings > AI assistant, which records who did and when, and sets a monthly budget.
- **"Ask Roadcase":** a panel in the signed-in app.
  - The assistant uses Claude through Anthropic's API.
  - It answers from tools that call Roadcase's own data functions as the person asking: search and read items, tickets, service logs and check-outs, and cost totals. So it sees exactly what they can, and never runs its own database queries.
- **What it never gets:**
  - signature images, contract PDFs or passwords;
  - other secrets;
  - guests' email addresses and phone numbers.
- **Drafting:**
  - On a ticket, "Draft a summary" writes a summary of its history for the completion note.
  - On a service log, it can tidy notes.
  - Both are suggestions in the form for the person to edit and save. The assistant changes nothing itself.
- **Records and limits:**
  - Each question is logged: who asked, when, which tools ran and the cost, but not the answers.
  - Admins see usage against the budget.
  - Questions are rate-limited per person.
- **Key and model:** the API key is a deployment setting (environment). The model is set in one place in the code; it starts with the current Claude Sonnet model.
- **Tests:** unit tests check each tool against the permission layer, so someone scoped to one location gets only that location's records through the assistant. End-to-end tests use a stand-in for the API.
- Done when: a Meadow Ranch editor asks "what's waiting on parts?" and gets only Meadow Ranch tickets; a draft ticket summary appears in the form for them to edit; the budget stops the assistant when it's spent; and with the assistant off, no request reaches Anthropic.

## Out of scope for Phase 4

- MaintainX (end of the project).
- Date-aware check-outs (bookings).
- Bulk inventory import.
- Reader-specific RFID connections before hardware is chosen.
- Choosing guest portal categories per campus.

## How to run it in Claude Code

1. Answer what you can in "Decisions needed" (inline in this file is fine).
2. Say: "Read CLAUDE.md and docs/PHASE4_PLAN.md, then do Step 0. Stop after Step 0 for my review."
3. Continue one step at a time, reviewing each.
