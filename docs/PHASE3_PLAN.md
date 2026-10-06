# Phase 3 plan: guest portal

Goal: staff at HNE send a guest group a private link. Without an account, the group requests equipment ahead of arrival and describes its band, and the audio team gets an input list. Staff review requests in a queue, and an approved request becomes a draft check-out. Work in the order below; finish and test each step before the next.

Phase 2 is in place: background jobs and branded email, ticket notifications, check-outs with optional fees, contract templates, e-signature with the PDF, and returns. MaintainX is deferred to the end of the project.

## Decisions needed

These come from the open questions in `docs/SCOPE.md` and from building Phase 2. Each lists the step it blocks and the default used if there's no answer by then.

| Question | Blocks | Default if unanswered |
| --- | --- | --- |
| Who approves guest requests from the portal? | Step 2 | Anyone with `checkout:manage` (editor) at the group's campus. They all get an email when a request comes in, and each person can opt out in Preferences |
| What does a guest group see in the catalog? | Step 1 | Items at the group's campus whose condition is available for check-out, in categories an admin has marked "Show in guest portal". Off by default, so nothing is public until an admin opts in |
| Do guests request specific items, or quantities of a kind ("4 × SM58")? | Step 1 | Quantities of a kind: identical items (same name and category) are grouped with a count available for the group's dates. Staff pick the actual items on approval |
| Do guests see fees? | Step 1 | No. Fees stay on the check-out and contract |
| How long does a portal link last? | Step 0 | Until 14 days after the group's departure date. Staff can revoke a link or send a new one at any time |
| Can a group change a request after sending it? | Step 1 | Yes, until staff start reviewing it; after that, the group asks staff |
| Band positions and the inputs each one needs | Step 3 | Per-campus defaults an admin can edit: vocal 1 mic; acoustic guitar 1 DI; electric guitar 1 mic; bass 1 DI; keys 2 DI (stereo); drums 7 (kick, snare, hi-hat, 2 toms, 2 overheads); playback 2 DI |
| Does the input list need a stage plot? | Step 3 | No. A table of channels only (channel, source, mic or DI, stand, notes); a stage plot can come later |

## New dependencies to approve

None expected. The portal reuses `@react-pdf/renderer` (input list PDF), pg-boss and email (links and alerts), and the existing barcode, storage and branding code.

## Security model (applies to every step)

- A portal link is `/portal/<token>`. The token is 32 random bytes in base64url; only its SHA-256 is stored, so a database leak doesn't reveal working links. The token is in the path, never in a query string.
- Portal pages have no user session. Each request resolves the token to one guest group, then checks that the link isn't expired or revoked and that the group isn't archived. Anything else returns the same 404.
- Portal access goes through `src/lib/authz` as a separate principal (a portal group, not a user), with its own small set of actions and unit tests. It can never reach staff routes or other groups' data.
- Portal pages send `Referrer-Policy: no-referrer`, `noindex`, and `Cache-Control: private, no-store`. Requests are rate-limited per token and per IP, like sign-in.
- Guests never see item codes, notes, prices, service history, locations below the campus, or staff names other than their staff contact.

## Step 0: Guest groups and portal links

**Done (Oct 6, 2026).** Staff screens are at `/guests` (sidebar "Guest portal"); the portal is `/portal/<token>`. The link email's job carries the token encrypted with `SECRETS_ENCRYPTION_KEY`, so neither the app's tables nor pg-boss's hold a working link. Without the key, staff can still copy a link. Thirty bad links from one IP address in 15 minutes lock that address out of the portal for 15 minutes.

- New tables:
  - **GuestGroup**, belonging to a campus. It holds:
    - the group name
    - the representative's name, email and phone
    - arrival and departure dates
    - a staff contact
    - notes
    - an archived date
  - **PortalLink**: token hash, expiry, created by, revoked date, last used date.
- A check-out can link to a guest group (optional). Creating a check-out from a group fills in its details.
- Staff screens under "Guest portal" in the sidebar: a list of groups (filter by campus, upcoming or past), plus creating and editing a group.
- "Send portal link" emails the representative a branded message from the worker, and "Copy link" shows the link once. Sending a new link revokes the old one.
- Permissions: managing groups and links needs `checkout:manage` at the campus. Viewers with `checkout:read` see the list.
- The portal home `/portal/<token>` shows the organization's branding, the group's name and dates, and a staff contact.
- Done when: an editor creates a group and sends a link that shows up in Mailpit; the link opens the portal without signing in; an expired, revoked or altered link returns 404; and unit tests cover the portal principal.

## Step 1: Catalog and equipment requests

- A "Show in guest portal" setting on categories in Settings > Categories, and an optional guest-facing description per category.
- A portal catalog by category, grouping identical items with photos and how many are available for the group's dates. Availability counts items with a check-out-available condition that aren't held by an overlapping active check-out or approved request.
- The group builds one request (quantity per kind, plus a note) and sends it. It can edit the request until staff start reviewing.
- New tables: **EquipmentRequest** (status: Draft, Submitted, In review, Approved, Partly approved, Declined, Withdrawn) and **EquipmentRequestLine** (kind, quantity requested, quantity approved, staff note).
- The group gets a confirmation email, and the portal shows the request's status.
- Done when: a group sees only portal-enabled categories at its campus, requests quantities that are capped at what's available, and sends the request; a second group's link can't see it.

## Step 2: Staff review queue and request to check-out

- A queue under Guest portal showing submitted requests (filter by campus and status), with an email to approvers when one arrives (Phase 2 notification rules: queued in the transaction, checked with `can()` again when sent).
- Review: approve, change quantities (with a note to the group) or decline each line, then approve or decline the request. The group is emailed the result with the notes.
- "Create check-out draft" turns an approved request into a draft check-out for the group. Staff choose the actual items for each kind, with the Phase 2 availability checks, and the draft links back to the request.
- Done when: an editor approves a request with one line reduced; the group sees the new quantities and note in the portal and by email; and the draft check-out holds the chosen items and is refused unavailable ones.

## Step 3: Band builder and input list

- Per-campus band positions with their default inputs, edited by campus admins (the defaults in the table above, seeded per campus only when the campus has none).
- In the portal, the group sets how many of each position it has, plus names or notes per player (for example "lead vocal, wireless if possible"), the total channels it expects, and other needs such as in-ear monitors, playback or click track.
- The input list is generated from the band setup: numbered channels with source, mic or DI, stand and notes. Staff can adjust it (reorder, rename, add, remove) before sharing. Staff edits are kept separate, so a guest's changes don't wipe them out without a warning.
- The input list shows in the portal and the staff view, and downloads as a branded PDF built by the worker.
- The audio team gets an email when a band setup is submitted or changed (recipients follow the request-approver default).
- Done when: a group enters a band of 2 vocals, guitar, bass, drums and keys; the input list numbers 13 channels; staff adjust it; and the PDF matches the screen.

## Out of scope for Phase 3

Google sign-in, Drive import and export, the AI agent and the RFID UI (Phase 4). MaintainX (end of project). Guest accounts, payments, and a stage plot.

## How to run it in Claude Code

1. Answer what you can in "Decisions needed" (inline in this file is fine).
2. Say: "Read CLAUDE.md and docs/PHASE3_PLAN.md, then do Step 0. Stop after Step 0 for my review."
3. Continue one step at a time, reviewing each.
