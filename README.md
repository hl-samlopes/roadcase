# Roadcase

Multi-campus production equipment inventory, service tickets and guest check-outs.
See `docs/SCOPE.md` for the full scope and `docs/PHASE2_PLAN.md` for current work.

## Local setup

Requires Node 24+ and Docker.

```bash
cp .env.example .env        # then set SEED_ADMIN_PASSWORD and AUTH_SECRET
npm install                 # also generates the Prisma client
npm run services:up         # Postgres :5432, MinIO :9000 (console :9001), Mailpit :8025
npx prisma migrate dev      # apply migrations
npm run seed                # organization, campuses, admin user, default categories
npm run dev                 # http://localhost:3000
npm run worker              # background jobs (email); run it in a second terminal
```

Email sent in development goes to Mailpit; read it at http://localhost:8025. Nothing is
delivered to real inboxes. Settings > Notifications sends a test email, lists background
jobs that failed, and connects Slack channels for ticket alerts. Saving a Slack webhook
needs `SECRETS_ENCRYPTION_KEY` in `.env` (`openssl rand -base64 32`).

Check-outs are signed on the check-out's signing screen (made for a tablet). Once both
parties have signed, the worker makes the contract PDF and emails it to both; with
`npm run worker` running, it shows up in Mailpit with the PDF attached.

Items come back on the check-out page (scan to tick each one, then set its condition). A
condition that starts a repair ticket opens one for that item. Check-outs are overdue the
day after they're due, in `APP_TIME_ZONE`; the worker emails the staff representative on
the first overdue day and then weekly.

The seed is safe to rerun: it only creates rows that are missing and never changes the
admin password after the first run.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e            # first run: npx playwright install chromium
```

End-to-end tests start their own dev server on port 3100 against a separate
`roadcase_e2e` database, which is rebuilt on every run. Your dev data is not touched.
They also start a background worker on that database (its log is in
`test-results/e2e-worker.log`) and need Mailpit running (`npm run services:up`).
