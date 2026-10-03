# Phase 1 plan: core inventory

Goal: HNE staff can sign in, see only what their permissions allow, manage equipment with custom fields, photos and barcodes, and run repair tickets that end in service logs. Work in the order below; finish and test each step before the next.

## Step 0: Project setup
- Create the Next.js (TypeScript, App Router) project, Tailwind, ESLint, Prettier, Vitest, Playwright.
- Add Prisma and Postgres (Docker compose with Postgres and MinIO).
- Copy `CLAUDE.md` to the repo root and the scope export to `docs/SCOPE.md`.
- Done when: `npm run dev` shows a placeholder page and `npm test` passes.

## Step 1: Data model and seed
Tables: Organization, Campus, Location, Department, DepartmentLocation (links departments to locations), User, PermissionGrant (user, level, scope type, scope id), Category, Subcategory, Item, FieldDefinition, Attachment, ServiceTicket, TicketEvent, ServiceLog, RfidTag (nullable, unused for now), OrganizationBranding (display name, logo light/dark, favicon, color and font tokens, radius, app background, sign-in page settings), UserPreference.
- Seed: the first organization (Hume), campuses HLK, HNE, HSC, one admin user (password from env), default categories (Audio, Lighting, Video, Staging, Cabling) with a few subcategories each.
- Done when: migrations apply cleanly and the seed is repeatable.

## Step 2: Auth and permissions
- Username/password sign-in, sessions, sign-out, password change.
- Authz layer: `can(user, action, resource)` resolves the highest grant across organization-wide, campus, location and department scopes. Levels: viewer, commenter, editor, admin. Commenters may also submit tickets.
- Tests for the two scenarios in the scope: an editor limited to one camp, and a food service manager with viewer plus ticket submission across a department.
- Admin screens: users list, create/edit user (username, password, display name, email, role, level), manage grants.
- Done when: unit tests cover scope resolution and an e2e test shows a scoped user cannot reach another campus's items by URL.

## Step 3: App shell in the Concept A style
- Sidebar (Inventory, Service tickets, Service log, Check-outs, Guest portal, Settings), campus switcher, user menu.
- Theme system driven by CSS variables: tokens from `CLAUDE.md`, light and dark, `--radius`. Fonts loaded through `next/font`.
- Per-user preferences (mode, accent, font pairing) saved to the account.
- Sign-in page rendered from the organization's branding (logo, headline, background), falling back to the Roadcase defaults. The sign-in route resolves the organization from the URL (subdomain or path) so branding shows before login.
- Done when: switching mode or accent persists across sessions and passes contrast checks.

## Step 4: Inventory
- Item list: table with search, filters (category, location, condition), sort, pagination.
- Item create/edit, detail panel with photo, fields, attachments, price, service history.
- Admin-managed custom fields (text, number, date, dropdown, checkbox; required flag; reorder; archive on delete).
- Attachments: upload photos and documents to S3-compatible storage with size and type limits.
- Auto-generated unique code per item, Code 128 barcode, printable label (single and batch), CSV export.
- Done when: an editor can add an item with a photo and custom field, find it by scanning its barcode, and a viewer cannot edit it.

## Step 5: Tickets and service logs
- Setting condition to "needs repair" creates a ticket; users with commenter level or above can also submit one.
- Ticket queue scoped by campus and department; statuses Open, Assigned, In progress, Waiting on parts or vendor, Completed, Cancelled.
- Assignee: internal user, another department, or an outside company (free text plus contact).
- Event timeline on each ticket (actions, comments, attachments).
- Completing a ticket creates the service log (date, type, cost, notes, attachments) automatically.
- Service log appears on the item and on a separate filterable page with cost totals.
- Done when: the full flow from flag to log works end to end with permissions respected.

## Step 6: Settings > Appearance (organization admin UX and branding editor)
- Colors: organization admins edit organization-wide tokens for background, surface, text, muted text, border, accent, warning and error, in light and dark; heading and body font from an allowed sans-serif list; corner radius.
- Identity: display name, logo (separate light and dark versions) and favicon, uploaded to storage with type and size limits.
- Backgrounds: optional background image for the app and a separate one for the sign-in page, with a dimming overlay so text stays readable.
- Sign-in page: custom headline and welcome message, logo placement, and background; shown to people before they sign in.
- Branding carries through to the guest portal, notification emails and contract PDFs (those come in later phases, so expose the settings now and wire them in then).
- Live preview of the app shell and sign-in page, and "reset to defaults". Warn when a text/background pair falls below 4.5:1 contrast.
- Users choose mode, accent and font pairing within what the admin allows.
- Done when: an admin change applies to all users after reload, the sign-in page shows the organization's branding while signed out, and reset restores the Roadcase (Concept A) defaults.

## Out of scope for Phase 1
Email and Slack notifications and the MaintainX sync (Phase 2), check-out contracts (Phase 2), guest portal and band builder (Phase 3), Google sign-in, Drive and the AI agent (Phase 4), RFID UI (later).

## How to start in Claude Code
1. Create the repo, open it in Claude Code, add `CLAUDE.md` and the scope export.
2. Say: "Read CLAUDE.md and docs/PHASE1_PLAN.md, then do Step 0 and Step 1. Stop after Step 1 for my review."
3. Continue one step at a time, reviewing each.
