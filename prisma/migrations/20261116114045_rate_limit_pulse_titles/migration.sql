-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");

-- Pulse titles now follow the survey and session number, e.g. "Pre-promotion 360 · S2 Pulse check".
UPDATE "Assessment" p
SET "title" = LEFT(r."title" || ' · S' || p."sessionNumber" || ' Pulse check', 200)
FROM "Assessment" r
WHERE p."rootAssessmentId" = r."id" AND p."type" = 'PULSE';
