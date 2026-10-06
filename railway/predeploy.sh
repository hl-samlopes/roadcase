#!/bin/sh
# Runs before each web deploy goes live: apply database migrations, then the
# seed when SEED_ADMIN_PASSWORD is set (the seed is safe to rerun; remove the
# password variable after the first deploy).
set -e
npx prisma migrate deploy
if [ -n "$SEED_ADMIN_PASSWORD" ]; then
  npm run seed
fi
