# Roadcase

Multi-campus production equipment inventory, service tickets and guest check-outs.
See `docs/SCOPE.md` for the full scope and `docs/PHASE1_PLAN.md` for current work.

## Local setup

Requires Node 24+ and Docker.

```bash
cp .env.example .env        # then set SEED_ADMIN_PASSWORD
npm install                 # also generates the Prisma client
npm run services:up         # Postgres on :5432, MinIO on :9000 (console :9001)
npx prisma migrate dev      # apply migrations
npm run seed                # organization, campuses, admin user, default categories
npm run dev                 # http://localhost:3000
```

The seed is safe to rerun: it only creates rows that are missing and never changes the
admin password after the first run.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e            # first run: npx playwright install chromium
```
