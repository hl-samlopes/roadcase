# Roadcase – Project Scope

Oct 1, 2026 · @Samuel

## Overview

Roadcase is a standalone, multi-campus web app that tracks production equipment, its service history and repair tickets, and lets guest groups request and sign out gear. It launches at Hume New England (HNE) and is designed so Hume Lake (HLK), Hume SoCal (HSC) and later camps can join without rework.

Decisions made so far:

- **Stack:** Next.js (TypeScript) with PostgreSQL.
- **Tenancy:** one organization (Hume, the first) with many campuses, sharing one database and roles, with branding set per organization.
- **Phasing:** core inventory first; check-out, portal and integrations follow.
- **Signatures:** built-in e-signature captured in the app, with a PDF emailed to both parties.

## Organization model

Every record belongs to a place in a four-level hierarchy, and permissions attach at any level.

| Level | Meaning | Example |
| --- | --- | --- |
| Organization | The top-level account | Hume |
| Campus (site) | A physical campus | HNE, HLK, HSC |
| Camp / location | A camp or venue within a campus | Meadow Ranch (MR) at HLK |
| Department | A functional group, linked to the locations it owns equipment in | Production, Food Service |

Adding a new campus, camp or department is an admin action in the app, not a code change. An item has one home location and one owning department.

## Accounts and permissions

The first release uses username and password accounts; Google sign-in comes in a later phase. Each account has a username, password, display name, email, role and permission level.

**Levels**, each including the one before it:

1. **Viewer:** see items, logs and tickets.
2. **Commenter:** also comment on items and tickets, and submit a service ticket.
3. **Editor:** also create and edit items, logs and tickets, and run check-outs.
4. **Admin:** also manage fields, users, permissions and settings within their scope.

**Scopes.** A level is granted for one scope: organization-wide, a single campus, a single camp or location, or a single department. A user can hold several grants.

- A summer staffer at Meadow Ranch gets Editor scoped to the Meadow Ranch location only.
- The food service manager gets Viewer plus ticket submission, scoped to the Food Service department across all campuses, so they see every location with food service equipment.

Permissions are checked on the server for every request, never only hidden in the UI.

## Inventory

Every piece of production equipment is a record with these starting fields: photo, name, category, subcategory, location, condition and notes. Each item also gets a price, any number of attached photos and documents, and a unique code with a printable barcode.

- **Custom fields:** admins add, rename, reorder or delete fields, choose the type (text, number, date, dropdown, checkbox), and mark any field required. Deleting a field archives its data first.
- **Codes and barcodes:** each item gets an auto-generated unique code (for example HNE-000123) and a Code 128 or QR barcode. Labels print from the item page, singly or in batches, and scanning a label opens the item.
- **Browsing:** search, filter by any field, and sort. Bulk edit and CSV export are included. The app starts empty, so no existing inventory is imported.
- **Condition and flags:** setting an item to "needs repair" starts a service ticket (see next section).

* **RFID (planned):** each item can later be linked to one or more RFID tags alongside its barcode, for quick scan-in and scan-out at check-out and for inventory counts. The data model reserves a tag field now, so no rework is needed when readers are chosen.

## Service logs and tickets

A ticket is the work order; a service log is its final record.

1. An item is flagged "needs repair", or a user submits a ticket, and a ticket is created.
2. The ticket enters a queue, scoped to the item's campus and department, and a notification goes out by email and Slack.
3. An editor triages it and records who will do the work: internal staff, another department, or an outside company.
4. Actions are logged on the ticket as they happen, with comments, photos and documents.
5. On completion, the ticket becomes a service log entry automatically.

**Service log fields:** service date, service type, service cost, service notes, and photo or document attachments. Logs show on the item's own page and on a separate, filterable service log page across all items, with a cost total for the filtered view.

Ticket statuses: Open, Assigned, In progress, Waiting on parts or vendor, Completed, Cancelled.

## Guest check-out and contracts

A staff member builds a check-out by selecting equipment into a list, which becomes part of a rental agreement signed by both sides.

- **Item list:** pick items by search or barcode scan. Each line can carry an optional rental fee; fees are never required.
- **Contract editor:** the contract text and list layout are edited in a word-processor-style editor (headings, bold, lists, tables) and saved as reusable templates per campus.
- **Signing:** the guest group representative and the Hume representative each enter a printed name, draw a signature on a tablet or phone, and the date signs automatically.
- **Delivery:** the signed agreement is generated as a PDF, stored on the checkout record, and emailed to both addresses.
- **Return:** items are checked back in against the same record, with condition notes. A damaged return can start a service ticket.

Built-in signatures record a timestamp and IP address. If Hume later needs a stronger legal audit trail, a provider such as DocuSign can be added behind the same flow. Hume should have the contract template reviewed by counsel.

## Customer portal and band builder

Staff send each guest group a unique link to a public portal. No account is needed.

- **Equipment request:** the group sees the equipment available to them and requests items ahead of arrival. Requests land in a staff review queue to approve, edit or decline; approved requests can become a check-out draft.
- **Band builder:** the group sets quantities for band positions (for example vocals, guitar, bass, drums, keys), the number of channels they need, and related details.
- **Input list:** the app generates an input list from the band setup, viewable and exportable as PDF for the audio team before arrival.

Portal links can expire and are limited to what that group is allowed to see.

## Integrations and appearance

**Integrations**

- **Email:** ticket alerts, signed contract PDFs and portal links, sent through a transactional email service.
- **Slack:** a ticket notification posts to a chosen channel per campus or department.
- **Google:** sign-in with Google OAuth, and import from or export to Google Drive, in a later phase.
- **AI agent:** a later option, such as answering questions about inventory or drafting ticket summaries. It would use the same permissions as the signed-in user.

* **MaintainX:** tickets and service logs sync with MaintainX work orders, so maintenance staff can keep working in the tool they already use. Items link to MaintainX assets, and a completed work order writes back as a service log entry. Sync direction and field mapping are still to be decided.

**Appearance.** Each user can choose light or dark mode, an accent color for design elements, and a font pairing. Headings and body text both use sans-serif fonts, for example Inter Bold 24px with Krub 12px, or Space Mono Bold 24px with Plus Jakarta Sans 12px. The settings are saved to the account. Design direction chosen: Concept A ("Utility"), a sidebar layout with a dense inventory table, Inter Bold 24px headings and Krub 12px body, in light mode by default with a blue accent. Its default colors and fonts ship as the app's defaults. An organization admin also gets a UX editor in Settings to change the color of each interface element (backgrounds, text, borders, accent, status colors) and the heading and body fonts for the whole organization; individual users then choose light or dark mode, accent color and font pairing within the options the admin allows.

**Branding.** The product name is Roadcase and it stands alone: no Hume branding in the default look. Each organization's admin brands its own instance in the UX settings: display name, logo (light and dark versions) and favicon, colors, heading and body fonts, background images for the app and the sign-in page, and a custom sign-in page (headline, welcome message, logo placement). The guest portal, notification emails and contract PDFs use the same branding. Until an organization sets its own, the Roadcase default look (Concept A) applies, and a reset restores it.

## Roadmap, architecture and open questions

The build runs in four phases; each ends with something Hume can use.

1. **Phase 1, core:** organization and campuses, accounts and scoped permissions, inventory with custom fields, photos, codes and barcodes, service logs, and tickets with a queue.
2. **Phase 2, check-out and alerts:** item lists, the editable contract, built-in e-signature and PDF email, rental fees, plus email and Slack notifications and the MaintainX sync.
3. **Phase 3, guest portal:** shareable portal links, equipment requests, the band builder and the input list.
4. **Phase 4, Google and AI:** Google sign-in, Drive import and export, the AI agent, and RFID tag support.

**Architecture.** Next.js (TypeScript) app, PostgreSQL database, S3-compatible storage for photos and documents, a background worker for emails, Slack and PDFs, and every record tagged with its organization, campus, location and department so scoped permissions are enforced in one place.

**Open questions**

- [ ] Which design concept do we pick (three concepts to be produced)?
- [ ] Preferred hosting and budget (for example Vercel with Railway, or another provider)?
- [ ] Which Slack workspace and channels, and which sending email address, for ticket notifications?
- [ ] MaintainX: do you have an account, and should tickets sync one way or both ways?
- [ ] Does every item need a rental fee option, or only some categories?
- [ ] Who approves guest requests from the portal?
