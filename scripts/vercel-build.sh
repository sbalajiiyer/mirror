#!/usr/bin/env bash
# Vercel build: apply migrations, optionally (re)seed the demo account, then build.
set -euo pipefail
npx prisma migrate deploy
if [ "${SEED_DEMO_ON_BUILD:-false}" = "true" ]; then
  # Idempotent: wipes and recreates only the demo user (demo@mirror.local) and its data.
  npx prisma db seed
fi
npx next build
