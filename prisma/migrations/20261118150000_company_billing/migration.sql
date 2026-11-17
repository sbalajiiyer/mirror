-- Phase 11e: company plan and premium-AI budgets.
ALTER TABLE "Organization" ADD COLUMN "platformPaidUntil" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "aiBudgetCents" INTEGER;
ALTER TABLE "Organization" ADD COLUMN "aiPerPersonCents" INTEGER;
-- Companies that already exist keep working for 30 days from this change before the plan is needed.
UPDATE "Organization" SET "platformPaidUntil" = now() + interval '30 days' WHERE "platformPaidUntil" IS NULL;
CREATE INDEX "AIInteractionLog_workspaceId_createdAt_idx" ON "AIInteractionLog"("workspaceId", "createdAt");
