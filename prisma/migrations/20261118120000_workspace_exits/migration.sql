-- Phase 11d: leaving a company.
ALTER TABLE "Organization" ADD COLUMN "allowPersonalCopy" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "OrgMember" ADD COLUMN "exitedAt" TIMESTAMP(3);
ALTER TABLE "OrgMember" ADD COLUMN "exitPurgeAt" TIMESTAMP(3);
ALTER TABLE "OrgMember" ADD COLUMN "exitCopiedAt" TIMESTAMP(3);
ALTER TABLE "Assessment" ADD COLUMN "copiedFrom" TEXT;
CREATE INDEX "OrgMember_exitPurgeAt_idx" ON "OrgMember"("exitPurgeAt");
