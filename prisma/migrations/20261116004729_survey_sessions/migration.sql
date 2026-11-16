-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "sessionLabel" TEXT,
ADD COLUMN     "sessionNumber" INTEGER NOT NULL DEFAULT 1;

-- Backfill: number existing sessions within each survey by creation time
-- (the root 360 is session 1, then re-runs/pulses in order).
UPDATE "Assessment" a
SET "sessionNumber" = s.rn
FROM (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY COALESCE("rootAssessmentId", id) ORDER BY ("rootAssessmentId" IS NOT NULL), "createdAt") AS rn
  FROM "Assessment"
) s
WHERE a.id = s.id;
