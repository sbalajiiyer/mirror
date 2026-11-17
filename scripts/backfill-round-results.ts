import "dotenv/config";
import { backfillRoundResults } from "../src/lib/services/round-results";
import { db } from "../src/lib/db";

// Phase 11: adds closed company round 360s to the frozen round totals. Idempotent; safe on every deploy.
backfillRoundResults(5000)
  .then((n) => console.log(`Round results: added ${n} closed round 360(s).`))
  .finally(() => db.$disconnect());
