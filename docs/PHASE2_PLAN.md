# Phase 2 plan: check-out and alerts

Goal: staff at HNE can check equipment out to a guest group with a signed contract (built-in e-signature, branded PDF emailed to both parties), check it back in with damage turning into tickets, and the right people hear about tickets by email and Slack. MaintainX sync follows once its open questions are answered. Work in the order below; finish and test each step before the next.

Phase 1 is in place: scoped permissions in `src/lib/authz`, items with codes and barcodes, per-organization conditions, tickets and service logs, branding, and CI.

## Decisions needed

These come from the open questions in `docs/SCOPE.md` and from building Phase 1. Each lists the step it blocks and the default used if there's no answer by then.

| Question | Blocks | Default if unanswered |
| --- | --- | --- |
| Which transactional email service, and which sending address? | Steps 0, 1, 4 | Build behind a small `src/lib/email` interface; use Mailpit locally until a service is chosen |
| Hosting (for example Vercel with Railway)? The background worker needs a long-running process | Step 0 (deploy) | Run the worker as a second process from the same repo; any host that runs it works |
| Which Slack workspace and channels get ticket alerts? | Step 1 | One incoming webhook per campus or department, set in Settings |
| Who gets ticket emails? | Step 1 | Editors over the ticket's scope when it opens, the assignee when assigned, the reporter when it completes; each person can opt out |
| Does every item get a rental fee option, or only some categories? | Step 2 | An optional fee on any check-out line; fees are never required (as in the scope) |
| Which item conditions can be checked out? | Step 2 | A new "Available for check-out" flag on conditions, on for New, Good and Fair |
| Has counsel reviewed the contract template? | Step 4 (go-live) | Ship a placeholder template marked "Draft — not reviewed"; HNE replaces it |
| E-signature requirements: consent wording, record retention | Step 4 | An explicit consent checkbox before signing (electronic records consent); keep signed contracts and their audit trail indefinitely |
| MaintainX: do you have an account, and one-way or two-way sync? | Step 6 | **Answered (Oct 6, 2026):** one-way. Step 6 moves to the end of the project (after Phase 4) |

## New dependencies to approve (step 0)

- `pg-boss` is already in the stack.
- The chosen email service's SDK (or plain HTTP, if its API is simple enough).
- A PDF renderer for contracts. Options: `@react-pdf/renderer` (PDFs from React components; light), or printing HTML with Playwright's Chromium (exact match with the on-screen contract, but heavy to run in production). Recommended: `@react-pdf/renderer`.
- A rich text editor for contract templates: TipTap (built on ProseMirror). It stores documents as JSON rather than raw HTML, so no HTML sanitizer is needed for stored templates.
- Mailpit as a Docker Compose service for local email (an image, not an npm package).
- Slack incoming webhooks use plain `fetch`, so no dependency.

## Step 0: Background jobs and email foundations

- Add a pg-boss worker (`npm run worker`) that shares the app's database. Jobs are idempotent, retry with backoff, and record failures.
- `src/lib/email`: one `sendEmail` interface with providers for the chosen service and for Mailpit in development. Emails use organization branding (display name, logo, colors) and always include a plain-text version.
- Add Mailpit to `docker-compose.yml`; e2e tests read sent mail from its API.
- Settings > Notifications shows recent job failures to organization admins.
- Done when: a test job runs in the worker and retries after a failure, and a branded test email shows up in Mailpit.

## Step 1: Ticket notifications (email and Slack)

- Events: ticket opened (submitted or flagged automatically), assigned, completed, and a comment on a ticket you reported or are assigned to.
- Recipients follow the default above (or HNE's answer). Never email someone who can't see the ticket. Check with `can()` when sending, not just when queuing.
- Slack: admins add an incoming webhook per campus or department in Settings > Notifications, with a "Send test message" button. Webhook URLs are secrets: stored encrypted, never shown again in full, never logged.
- Per-user notification preferences in Preferences (opt out per event).
- Messages link to the ticket and never include attachment contents.
- Done when: opening a ticket emails the right editors and posts to the configured Slack channel; preferences and permissions are respected; failed sends retry and show to admins.

## Step 2: Check-outs and item lists

- New tables: Checkout and CheckoutLine. Each checkout gets a number per organization, and belongs to a campus.
- A checkout records:
  - the guest group name
  - the guest representative's name, email and phone
  - the staff representative
  - dates out and back
  - status: Draft, Awaiting signatures, Out, Partially returned, Returned or Cancelled
- Each line is one item, with an optional fee and its return details (condition, notes, when it came back).
- Build the list by search or barcode scan (the same keyboard-scanner input as Phase 1).
  - Refuse items that are already on another active checkout, or whose condition isn't available for check-out.
  - Say which items were refused and why.
- Permissions: running check-outs needs `checkout:manage` (editor) at the campus, and the user must be able to read every item added. The authz layer gets a checkout resource; add unit tests for it.
- Fee totals show on the checkout. Fees are optional and never required.
- Done when: an editor builds a draft check-out by scanning items, adds optional fees, and is stopped from adding unavailable or out-of-scope items.

## Step 3: Contract templates

- Contract templates per campus, edited by campus admins in a word-processor-style editor: headings, bold, lists and tables.
- Merge fields such as `{{group}}`, `{{guest_rep}}`, `{{dates}}`, `{{item_list}}` (rendered as a table with codes and fees), `{{fees_total}}` and `{{organization}}`. Unknown fields are flagged in the editor.
- Templates are versioned. Editing a template never changes contracts that were already signed.
- A preview fills the template from a sample or real draft check-out.
- Done when: a campus admin edits a template with a table and merge fields, previews it against a draft check-out, and older versions stay attached to the contracts that used them.

## Step 4: Signing and the contract PDF

- A signing screen that works on a tablet or phone:
  - the full contract is shown, then the guest representative and the staff representative each enter a printed name and draw a signature, and the date fills in automatically
  - an explicit consent checkbox comes before signing
- For each signature, record the timestamp, IP address, user agent and a SHA-256 hash of the exact contract text signed. Signature images go to private storage and are never logged.
- After both signatures the contract is locked, and the checkout moves to Out.
- The worker generates the PDF: branded, with the item list, both signatures and an audit page. It's stored on the checkout and emailed to both addresses.
- Admins can view the audit trail and download the PDF again. Anyone who can see the checkout can download the PDF; the raw signature images are visible to admins only.
- Done when: both parties sign on a tablet, the PDF reaches both email addresses (in Mailpit locally), the contract can't change after signing, and the audit details match the PDF.

## Step 5: Returns

- Check items back in against the checkout by scan or from the list, with condition and notes for each line. Partial returns are allowed.
- Returning an item in a condition flagged to start a repair ticket opens a ticket (the Phase 1 flow), linked to the checkout and pre-filled with the return notes.
- Overdue checkouts are flagged in the list, and the worker emails the staff representative a reminder.
- Done when: returning a checkout with one damaged item opens a ticket for that item only; the checkout shows Returned (or Partially returned) with its full history; overdue reminders arrive.

## Step 6: MaintainX sync (deferred to the end of the project)

Decided Oct 6, 2026: one-way sync, built after Phase 4. Phase 2 is complete without it. Tickets already carry `maintainxWorkOrderId` and items `maintainxAssetId`, so nothing built before then needs to change. The account question (test workspace or production only) is answered when this starts.

- Connection settings for organization admins. The API key is a secret: stored encrypted and never logged.
- Map items to MaintainX assets, using the existing `maintainxAssetId` field.
- One-way: opening or updating a ticket creates or updates a work order (using the existing `maintainxWorkOrderId` field).
- A sync log page shows each push and webhook with its result, and failed syncs can be retried.
- Done when: one-way sync works end to end against a MaintainX test workspace (or a faithful stand-in), and a sync failure never blocks working in Roadcase.

## Phase 1 follow-ups (schedule any time)

Not started in Phase 1; each is small and independent:

- item deletion (and when it's allowed)
- bulk edit
- editing categories and subcategories in Settings
- logging service directly without a ticket
- camera barcode scanning on phones, using the browser's BarcodeDetector where available
- an assign form that shows only the fields for the chosen assignee type

## Out of scope for Phase 2

Guest portal, equipment requests and the band builder (Phase 3). Google sign-in, Drive import and export, and the AI agent (Phase 4). RFID UI (later).

## How to run it in Claude Code

1. Answer what you can in "Decisions needed" (inline in this file is fine).
2. Say: "Read CLAUDE.md and docs/PHASE2_PLAN.md, then do Step 0. Stop after Step 0 for my review."
3. Continue one step at a time, reviewing each.
