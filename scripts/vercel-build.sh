#!/usr/bin/env bash
# Vercel build: apply migrations, optionally (re)seed the demo account, then build.
set -euo pipefail
npx prisma migrate deploy
# Phase 11: count closed company round 360s into the frozen round totals (idempotent).
npx tsx scripts/backfill-round-results.ts
if [ "${SEED_DEMO_ON_BUILD:-false}" = "true" ]; then
  # Idempotent: wipes and recreates only the demo user (demo@mirror.local) and its data.
  npx prisma db seed
fi
npx next build
