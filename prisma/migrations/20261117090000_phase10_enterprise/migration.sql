-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "orgId" TEXT,
ADD COLUMN     "subjectId" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "region" TEXT NOT NULL DEFAULT 'us',
ADD COLUMN     "retentionMonths" INTEGER,
ADD COLUMN     "ssoClientId" TEXT,
ADD COLUMN     "ssoClientSecret" TEXT,
ADD COLUMN     "ssoDomain" TEXT,
ADD COLUMN     "ssoDomainToken" TEXT,
ADD COLUMN     "ssoDomainVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "ssoEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ssoIssuer" TEXT,
ADD COLUMN     "ssoRequired" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SsoTicket" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SsoTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SsoTicket_tokenHash_key" ON "SsoTicket"("tokenHash");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_subjectId_createdAt_idx" ON "AuditLog"("subjectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_ssoDomain_key" ON "Organization"("ssoDomain");


-- Backfill: events recorded on an organization belong to it.
UPDATE "AuditLog" SET "orgId" = "entityId" WHERE "entity" = 'Organization' AND "orgId" IS NULL;
