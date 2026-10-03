# Roadcase

Roadcase is a standalone, multi-campus web app for managing production equipment: inventory, service logs and tickets, guest check-out contracts, and a guest portal. It starts at Hume New England (HNE) as the first organization; built so Hume Lake (HLK), Hume SoCal (HSC) and other camps can join. The product name is Roadcase; do not put "Hume" in the product name, code identifiers or default UI. Hume branding is applied only through the organization branding settings.

Full scope: `docs/SCOPE.md`. Current work: `docs/PHASE1_PLAN.md`. Read both before starting a session.

## Stack
- Next.js (App Router, TypeScript strict), React Server Components where possible
- PostgreSQL with Prisma (migrations in `prisma/migrations`)
- Auth.js with a Credentials provider now (username + password, argon2 hashing); Google OAuth added in Phase 4
- S3-compatible storage for photos and documents (local MinIO in dev)
- Background jobs (pg-boss) for email, Slack, PDF generation
- Tailwind CSS with CSS variables for theming; no component library that fights the theme system
- Vitest for unit tests, Playwright for end-to-end

## Decisions already made
- One organization (Hume) with many campuses sharing one database. Do NOT build separate tenant databases.
- Hierarchy: Organization > Campus (HLK, HNE, HSC) > Camp/Location > Department. Every record carries organization, campus, location and department ids.
- Permission levels: viewer < commenter < editor < admin. A grant = user + level + scope, where scope is organization-wide, campus, location, or department. Users can hold several grants.
- Permissions are enforced on the server in one place (`src/lib/authz`). Never rely on hiding UI.
- Inventory fields are admin-configurable (add, rename, delete, required). Store custom values in JSONB; keep core fields (name, category, subcategory, location, condition, notes, price) as real columns.
- Each item gets a unique code (`HNE-000123`) and a Code 128 barcode. RFID tag support is planned: keep a nullable tag table now, build the UI later.
- Built-in e-signature for contracts (drawn signature, timestamp, IP), generated PDF emailed to both parties.
- MaintainX sync is planned for Phase 2; design tickets so they can map to MaintainX work orders.
- The app starts empty. No inventory import.
- Branding is per organization and editable by organization admins in Settings > Appearance: logos (light and dark) and favicon, colors, heading and body fonts, app and sign-in background images, a custom sign-in page, and the display name used in the header, emails and contract PDFs. The guest portal and PDFs use the same branding. Roadcase's own look (Concept A) is the default until an organization sets its own.

## Design system (Concept A "Utility")
Light by default, with dark mode. All colors and fonts are CSS variables so an organization admin can change them (plus logos, backgrounds and the sign-in page) in Settings > Appearance, and each user can choose mode, accent and font pairing within what the admin allows. Never hard-code a color, font or logo in a component; read it from the theme tokens or the branding settings.

Default tokens, light: bg `#F6F7F9`, surface `#FFFFFF`, text `#14181F`, muted `#566070`, border `#DDE1E8`, accent `#1B5FD1`, warn `#8A5A00`, bad `#B3361B`.
Default tokens, dark: bg `#0F1319`, surface `#171C24`, text `#EDF0F5`, muted `#9AA5B5`, border `#2A313C`, accent `#6EA2FF`, warn `#F0B84A`, bad `#FF8A6B`.
Fonts: headings Inter Bold 24px; body Krub 12px. Allowed alternates: Space Mono Bold + Plus Jakarta Sans; both headings and body must be sans serif.
Layout: left sidebar nav (220px), table-first inventory list, item detail panel with barcode and service history. Corner radius is a token (`--radius`, default 6px); a square-corner variant (0) was also approved as an option.
Reference mockups are in the design canvas (Concept A and A2).
Rules: text contrast at least 4.5:1, status never by color alone (always a text label), real buttons and labels.

## Conventions
- Small, reviewable commits. Run `npm run lint`, `npm run typecheck`, `npm test` before committing.
- Every schema change is a Prisma migration. Seed script creates campuses (HLK, HNE, HSC), an admin user, and default categories only. No fake inventory.
- Server actions validate input with zod and call the authz layer first.
- Never log passwords, tokens or signature images.
- Ask before adding a new dependency that is not in the stack above.

## Commands
- `npm run dev` start the app
- `npx prisma migrate dev` apply migrations
- `npm run seed` seed campuses, admin, defaults
- `npm test`, `npm run test:e2e`
