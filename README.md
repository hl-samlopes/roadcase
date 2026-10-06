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
delivered to real inboxes. Settings > Notifications sends a test email and lists
background jobs that failed.

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
