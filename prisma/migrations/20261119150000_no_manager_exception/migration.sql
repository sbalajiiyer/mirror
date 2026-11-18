-- Owner decision 2026-11-18: managers are never shown separately (development feedback, not a formal review).
-- Open 360s switch now; closed reports keep what raters were told when they answered.
UPDATE "Assessment" SET "showManagerSeparately" = false WHERE "status" <> 'CLOSED';
ALTER TABLE "Assessment" ALTER COLUMN "showManagerSeparately" SET DEFAULT false;
