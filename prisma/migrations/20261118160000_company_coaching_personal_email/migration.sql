-- Phase 11e: company-paid coaching and a personal sign-in email.
ALTER TABLE "User" ADD COLUMN "personalEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "personalEmailPending" TEXT;
ALTER TABLE "User" ADD COLUMN "personalEmailTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN "personalEmailTokenExp" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_personalEmail_key" ON "User"("personalEmail");
CREATE UNIQUE INDEX "User_personalEmailTokenHash_key" ON "User"("personalEmailTokenHash");

ALTER TABLE "CoachClientLink" ADD COLUMN "orgId" TEXT;
ALTER TABLE "CoachClientLink" ADD COLUMN "clientAcceptedAt" TIMESTAMP(3);
ALTER TABLE "CoachClientLink" ADD CONSTRAINT "CoachClientLink_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "CoachClientLink_orgId_idx" ON "CoachClientLink"("orgId");
